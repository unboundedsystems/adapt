import Adapt, {
    ActionInfo,
    AdaptElementOrNull,
    build,
    BuiltDomElement,
    ChangeType,
    findElementsInDom,
    isBuiltDomElement,
    QueryDomain,
    registerPlugin,
    Style,
    WidgetChange,
    WidgetPair,
    WidgetPlugin,
} from "@usys/adapt";
import { Logger, mapMap, mkdtmp, ObjectSet, removeUndef, sha256hex } from "@usys/utils";
import execa from "execa";
import * as fs from "fs-extra";
import { safeDump } from "js-yaml";
import { compact, uniq } from "lodash";
import * as path from "path";
import { inspect } from "util";

import { AnsibleHost, isAnsibleHostSsh } from "./ansible_host";
import {
    AnsibleGroup,
    AnsibleGroupProps,
    getGroups,
    isAnsibleGroupBuiltElement,
} from "./AnsibleGroup";
import {
    AnsibleImplicitPlaybook,
    AnsiblePlaybook,
    AnsiblePlaybookProps,
    isAnsibleImplicitPlaybookBuiltElement,
    isAnsiblePlaybookBuiltElement,
} from "./AnsiblePlaybook";
import {
    AnsibleRole,
    AnsibleRoleProps,
    isAnsibleRoleBuiltElement,
    roleName,
} from "./AnsibleRole";

interface PlaybookObs { }

type AnsibleQueryDomain = QueryDomain<null, null>;
type PlaybookElement = BuiltDomElement<AnsiblePlaybookProps>;
type PlaybookPair = WidgetPair<PlaybookElement, PlaybookObs>;
type RoleElement = BuiltDomElement<AnsibleRoleProps>;
type GroupElement = BuiltDomElement<AnsibleGroupProps>;

export function findPlaybookElems(dom: AdaptElementOrNull): PlaybookElement[] {
    const rules = <Style>{AnsiblePlaybook},{AnsibleImplicitPlaybook} {Adapt.rule()}</Style>;
    const candidateElems = findElementsInDom(rules, dom);
    return compact(candidateElems.map((e) => isAnsiblePlaybookBuiltElement(e) ? e : null));
}

export function findRoleElems(dom: AdaptElementOrNull): RoleElement[] {
    const rules = <Style>{AnsibleRole} {Adapt.rule()}</Style>;
    const candidateElems = findElementsInDom(rules, dom);
    return compact(candidateElems.map((e) => isAnsibleRoleBuiltElement(e) ? e : null));
}

export function findGroupElems(dom: AdaptElementOrNull): GroupElement[] {
    const rules = <Style>{AnsibleGroup} {Adapt.rule()}</Style>;
    const candidateElems = findElementsInDom(rules, dom);
    return compact(candidateElems.map((e) => isAnsibleGroupBuiltElement(e) ? e : null));
}

// QueryDomain for Ansible is always local
function queryDomain(_: PlaybookElement): AnsibleQueryDomain {
    return { id: null, secret: null };
}

function getHostname(host: AnsibleHost) {
    if ((host.ansible_connection === "local") ||
        (host.ansible_host == null)) {
        return "localhost";
    }
    return host.ansible_host;
}

// Mapping of groups to hostnames
function collectGroups(groupEls: GroupElement[]) {
    const groupsToHosts = new Map<string, Set<string>>();

    for (const groupEl of groupEls) {
        const hostGroups = getGroups(groupEl.props);
        const hostname = getHostname(groupEl.props.ansibleHost);

        for (const group of hostGroups) {
            let hosts = groupsToHosts.get(group);
            if (!hosts) {
                hosts = new Set<string>();
                groupsToHosts.set(group, hosts);
            }
            hosts.add(hostname);
        }
    }
    return groupsToHosts;
}

async function writeInventory(
    hosts: ObjectSet<AnsibleHost>,
    groupEls: GroupElement[],
    pluginDir: string) {

    let line: string;
    const lines = [];
    for (const host of hosts) {
        line = getHostname(host);
        append(host, "ansible_connection");
        append(host, "ansible_host");
        append(host, "ansible_port");
        append(host, "ansible_user");
        append(host, "ansible_docker_extra_args");
        append(host, "ansible_ssh_pass");
        append(host, "ansible_become");

        if (isAnsibleHostSsh(host) && host.ansible_ssh_private_key) {
            const keyFile = path.join(pluginDir, "key");
            await fs.writeFile(keyFile, host.ansible_ssh_private_key,
                { mode: 0o600 });
            line += ` ansible_ssh_private_key_file=${keyFile}`;
        }
        lines.push(line);
    }

    const hostGroups = collectGroups(groupEls);
    for (const [group, hostnames] of hostGroups) {
        lines.push(`[${group}]`);
        for (const host of hostnames) {
            lines.push(host);
        }
    }
    lines.push("");

    await fs.writeFile(inventoryFile(pluginDir), lines.join("\n"), { mode: 0o600 });

    function append(obj: any, key: string) {
        if (obj[key]) line += ` ${key}=${obj[key]}`;
    }
}

async function execPlaybook(el: PlaybookElement, pluginDir: string, log: Logger) {
    const args = [];
    let tmpdir: string | undefined;

    try {
        if (el.props.vars != null) {
            tmpdir = await mkdtmp("adapt-ansible-playbookdata");
            const varsFile = path.join(tmpdir, "extra_vars");
            await fs.writeJson(varsFile, el.props.vars);
            args.push("-e", "@" + varsFile);
        }

        args.push("-i", inventoryFile(pluginDir), playbookFile(el, pluginDir));

        const child = execa("ansible-playbook", args, {
            env: {
                ANSIBLE_HOST_KEY_CHECKING: "False",
                ANSIBLE_ROLES_PATH: rolesDir(pluginDir),
            },
        });

        // FIXME(mark): For debugging. Should probably simply go to MessageLogger,
        // but Plugin doesn't have one of those yet.
        //child.stdout.pipe(process.stdout);
        //child.stderr.pipe(process.stdout);

        try {
            const ret = await child;

            if (ret.stderr) log(ret.stderr);
            if (ret.stdout) log(ret.stdout);
        } catch (err) {
            if (err.stderr) log(err.stderr);
            if (err.stdout) log(err.stdout);
            const msg = err.message || err;
            throw new Error(`Error executing ansible-playbook: ${msg}`);
        }

    } finally {
        if (tmpdir) await fs.remove(tmpdir);
    }
}

async function installGalaxyRoles(roleEls: RoleElement[], pluginDir: string,
    log: Logger) {
    const roles = compact(uniq(roleEls.map((el) => el.props.galaxy)));
    if (roles.length === 0) return;

    await fs.ensureDir(rolesDir(pluginDir));

    for (const role of roles) {
        try {
            const ret = await execa("ansible-galaxy", [
                "install",
                "--roles-path", rolesDir(pluginDir),
                "--force", role
            ]);
            log(`Successfully installed ansible role '${role}':\n${ret.stdout}`);

        } catch (err) {
            if (err.stderr) log(err.stderr);
            if (err.stdout) log(err.stdout);
            const msg = err.message || err;
            throw new Error(`Error installing Ansible role: ${msg}`);
        }
    }
}

function implicitPlaybookFile(pluginDir: string) {
    return path.join(pluginDir, "implicit_playbook.yaml");
}

function playbookElementId(el: PlaybookElement) {
    if (!isBuiltDomElement(el)) {
        throw new Error(`Internal error: can only compute name of mounted elements`);
    }
    return sha256hex(el.id).slice(0, 16);
}

function playbookFile(el: PlaybookElement, pluginDir: string) {
    if (el.props.playbookFile) return el.props.playbookFile;
    return path.join(pluginDir, `playbook_${playbookElementId(el)}.yaml`);
}

function inventoryFile(pluginDir: string) {
    return path.join(pluginDir, "inventory");
}

function rolesDir(pluginDir: string) {
    return path.join(pluginDir, "roles");
}

function collectRolesByHost(roleEls: RoleElement[]) {
    const rolesByHost = new Map<string, RoleElement[]>();

    for (const roleEl of roleEls) {
        const host = roleEl.props.ansibleHost;
        if (!host) continue;
        const hostname = getHostname(host);
        let list = rolesByHost.get(hostname);
        if (!list) {
            list = [];
            rolesByHost.set(hostname, list);
        }
        list.push(roleEl);
    }
    return rolesByHost;
}

async function writeImplicitPlaybook(roleEls: RoleElement[], pluginDir: string) {
    const rolesByHost = collectRolesByHost(roleEls);
    if (rolesByHost.size === 0) return;

    const playbookObj = mapMap(rolesByHost, (host, roles) => ({
        hosts: host,
        roles: roles.map((el) => removeUndef({
            role: roleName(el.props),
            vars: getVars(el.props.vars),
        }))
    }));

    await fs.writeFile(implicitPlaybookFile(pluginDir), safeDump(playbookObj));

    function getVars(obj: object | undefined) {
        if (!obj || Object.keys(obj).length === 0) return undefined;
        return obj;
    }
}

async function writePlaybooks(playbookEls: PlaybookElement[], pluginDir: string) {
    playbookEls = playbookEls.filter((p) => p.props.playbookPlays != null);

    for (const el of playbookEls) {
        if (el.props.playbookFile != null) {
            throw new Error(`Cannot specify both playbookFile and ` +
                `playbookPlays on an AnsiblePlaybook`);
        }

        await fs.writeFile(playbookFile(el, pluginDir), safeDump(el.props.playbookPlays));
    }
}

async function implicitPlaybook(pluginDir: string): Promise<PlaybookElement> {
    const el =
        <AnsibleImplicitPlaybook
            key="Implcit Playbook"
            playbookFile={implicitPlaybookFile(pluginDir)}
        />;
    const built = await build(el, null);
    if (built.messages.length !== 0) {
        throw new Error(`Internal Error: Build of implicit playbook failed: ${inspect(built.messages)}`);
    }
    if (!isAnsibleImplicitPlaybookBuiltElement(built.contents)) throw new Error(`Internal error`);
    return built.contents;
}

interface AnsibleObjects {
    hosts: ObjectSet<AnsibleHost>;
    groups: GroupElement[];
    playbooks: PlaybookElement[];
    roles: RoleElement[];
    rolesWithHost: RoleElement[];
}

async function findAnsibleObjects(dom: AdaptElementOrNull, dataDir: string): Promise<AnsibleObjects> {
    const roles = findRoleElems(dom);
    const groups = findGroupElems(dom);

    const hosts = new ObjectSet<AnsibleHost>(undefined,
        { ansible_port: 22, ansible_user: "root" }
    );

    // Add all hosts from all roles and all groups
    const rolesWithHost = roles.filter((r) => {
        const host = r.props.ansibleHost;
        if (host) hosts.add(host);
        return host != null;
    });
    groups.forEach((r) => hosts.add(r.props.ansibleHost));

    const playbooks = findPlaybookElems(dom);
    if (rolesWithHost.length > 0) playbooks.push(await implicitPlaybook(dataDir));

    return { hosts, groups, playbooks, roles, rolesWithHost };
}

// Exported for testing
export class AnsiblePluginImpl
    extends WidgetPlugin<PlaybookElement, PlaybookObs, AnsibleQueryDomain> {

    seriesActions = true; // Don't run playbooks in parallel
    prevDom?: AdaptElementOrNull;
    curDom?: AdaptElementOrNull;
    prevObjs?: AnsibleObjects;
    curObjs?: AnsibleObjects;

    // NOTE(mark): This work is being done by hijacking observe only because
    // analyze does not currently allow async operations. This should likely
    // be in findElems instead.
    async observe(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull) {
        this.prevDom = prevDom;
        this.curDom = dom;
        this.prevObjs = await findAnsibleObjects(prevDom, this.dataDir);
        this.curObjs = await findAnsibleObjects(dom, this.dataDir);
        const { hosts, groups, roles, playbooks } = this.curObjs;

        await writePlaybooks(playbooks, this.dataDir);

        if (hosts.length > 0) {
            await writeInventory(hosts, groups, this.dataDir);
            await writeImplicitPlaybook(roles, this.dataDir);
            await installGalaxyRoles(roles, this.dataDir, this.log);
        }

        return super.observe(prevDom, dom);
    }

    findElems = (dom: AdaptElementOrNull): PlaybookElement[] => {
        const objs =
            dom === this.curDom ? this.curObjs :
            dom === this.prevDom ? this.prevObjs :
            undefined;
        if (!objs) throw new Error(`Unexpected DOM passed to findElems`);
        return objs.playbooks;
    }

    getElemQueryDomain = (el: PlaybookElement) => {
        return queryDomain(el);
    }
    getWidgetTypeFromObs = (_obs: PlaybookObs): string => {
        return "Ansible Playbook";
    }
    getWidgetIdFromObs = (_obs: PlaybookObs): string => {
        // Unclear where we might get this
        return "FIXME_MRT_ID";
        //return getAdaptId(obs) || obs.StackId || obs.StackName;
    }
    getWidgetTypeFromElem = (_el: PlaybookElement): string => {
        return "Ansible Playbook";
    }
    getWidgetIdFromElem = (el: PlaybookElement): string => {
        return playbookElementId(el);
    }

    computeChanges = (change: WidgetChange<PlaybookElement>, obs: PlaybookObs | undefined): ActionInfo => {
        const changes = new Set<BuiltDomElement>();
        const addChanges = (els: BuiltDomElement[] | undefined) => {
            if (els) els.forEach((el) => changes.add(el));
        };
        const actionInfo = (type: ChangeType, detail: string) => {
            return {
                type,
                detail,
                changes: [...changes].map((element) => ({ type, element, detail }))
            };
        };

        if (!this.curObjs) throw new Error(`Internal error: curObjs not set`);
        const { groups, rolesWithHost } = this.curObjs;
        const playbook = change.to || change.from;
        if (playbook) {
            addChanges([playbook]);
            if (playbook.componentType === AnsibleImplicitPlaybook) {
                addChanges(rolesWithHost);
            }
        }
        addChanges(groups);

        if (change.from == null && change.to == null) {
            throw new Error(`Reverting unrecognized Ansible Playbooks is not currently supported`);
        }
        if (change.to == null) {
            return actionInfo(ChangeType.delete, "Executing Playbook revert");
        }

        if (obs == null) {
            return actionInfo(ChangeType.create, "Executing Playbook");
        }

        // FIXME(mark): Cannot currently determine the state of the system
        // to evaluate whether the playbook needs run or not. So just always
        // execute for the moment.
        return actionInfo(ChangeType.modify, "Executing Playbook");
    }

    getObservations = async (_domain: AnsibleQueryDomain, _deployID: string): Promise<PlaybookObs[]> => {
        // FIXME(mark)
        return [];
    }

    createWidget = async (
        _domain: AnsibleQueryDomain,
        _deployID: string,
        resource: PlaybookPair): Promise<void> => {

        const el = resource.element;
        if (!el) throw new Error(`resource element null`);

        await execPlaybook(el, this.dataDir, this.log);
    }

    destroyWidget = async (
        _domain: AnsibleQueryDomain,
        _deployID: string,
        _resource: PlaybookPair): Promise<void> => {

        // FIXME(mark): What exactly am I deleting?
        //await execPlaybook(domain, resource.observed??, deployID, { state="absent" });
    }

    modifyWidget = async (
        _domain: AnsibleQueryDomain,
        _deployID: string,
        resource: PlaybookPair): Promise<void> => {

        const el = resource.element;
        if (!el) throw new Error(`resource element null`);

        await execPlaybook(el, this.dataDir, this.log);
    }
}

// Exported for testing
export function createAnsiblePlugin() {
    return new AnsiblePluginImpl();
}

registerPlugin({
    name: "ansible",
    module,
    create: createAnsiblePlugin,
});
