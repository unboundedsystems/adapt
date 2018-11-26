import Adapt, {
    AdaptElement,
    AdaptElementOrNull,
    build,
    findElementsInDom,
    isMountedElement,
    QueryDomain,
    registerPlugin,
    Style,
    UpdateType,
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
    isAnsibleGroupElement,
} from "./AnsibleGroup";
import {
    AnsibleImplicitPlaybook,
    AnsiblePlaybook,
    AnsiblePlaybookProps,
    isAnsibleImplicitPlaybookElement,
    isAnsiblePlaybookElement,
} from "./AnsiblePlaybook";
import {
    AnsibleRole,
    AnsibleRoleProps,
    isAnsibleRoleElement,
    roleName,
} from "./AnsibleRole";

interface PlaybookObs { }

type AnsibleQueryDomain = QueryDomain<null, null>;
type PlaybookElement = AdaptElement<AnsiblePlaybookProps>;
type PlaybookPair = WidgetPair<PlaybookElement, PlaybookObs>;
type RoleElement = AdaptElement<AnsibleRoleProps>;
type GroupElement = AdaptElement<AnsibleGroupProps>;

export function findPlaybookElems(dom: AdaptElementOrNull): PlaybookElement[] {
    const rules = <Style>{AnsiblePlaybook},{AnsibleImplicitPlaybook} {Adapt.rule()}</Style>;
    const candidateElems = findElementsInDom(rules, dom);
    return compact(candidateElems.map((e) => isAnsiblePlaybookElement(e) ? e : null));
}

export function findRoleElems(dom: AdaptElementOrNull): RoleElement[] {
    const rules = <Style>{AnsibleRole} {Adapt.rule()}</Style>;
    const candidateElems = findElementsInDom(rules, dom);
    return compact(candidateElems.map((e) => isAnsibleRoleElement(e) ? e : null));
}

export function findGroupElems(dom: AdaptElementOrNull): GroupElement[] {
    const rules = <Style>{AnsibleGroup} {Adapt.rule()}</Style>;
    const candidateElems = findElementsInDom(rules, dom);
    return compact(candidateElems.map((e) => isAnsibleGroupElement(e) ? e : null));
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
        child.stdout.pipe(process.stdout);
        child.stderr.pipe(process.stdout);

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

function playbookFile(el: PlaybookElement, pluginDir: string) {
    if (el.props.playbookFile) return el.props.playbookFile;

    if (!isMountedElement(el)) {
        throw new Error(`Internal error: can only compute name of mounted elements`);
    }
    return path.join(pluginDir, `playbook_${sha256hex(el.id).slice(0, 16)}.yaml`);
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
        const hostname = getHostname(roleEl.props.ansibleHost);
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
    if (!isAnsibleImplicitPlaybookElement(built.contents)) throw new Error(`Internal error`);
    return built.contents;
}

// Exported for testing
export class AnsiblePluginImpl
    extends WidgetPlugin<PlaybookElement, PlaybookObs, AnsibleQueryDomain> {

    hosts?: ObjectSet<AnsibleHost>;
    groups?: GroupElement[];
    roles?: RoleElement[];
    playbooks?: PlaybookElement[];

    async observe(prevDom: AdaptElementOrNull, dom: AdaptElementOrNull) {
        this.roles = findRoleElems(dom);
        this.groups = findGroupElems(dom);

        const hosts = new ObjectSet<AnsibleHost>(undefined,
            { ansible_port: 22, ansible_user: "root" }
        );
        // Add all hosts from all roles and all groups
        this.roles.map((r) => hosts.add(r.props.ansibleHost));
        this.groups.map((r) => hosts.add(r.props.ansibleHost));
        this.hosts = hosts;

        this.playbooks = findPlaybookElems(dom);
        await writePlaybooks(this.playbooks, this.dataDir);
        if (this.roles.length > 0) this.playbooks.push(await implicitPlaybook(this.dataDir));

        if (hosts.length > 0) {
            await writeInventory(this.hosts, this.groups, this.dataDir);
            await writeImplicitPlaybook(this.roles, this.dataDir);
            await installGalaxyRoles(this.roles, this.dataDir, this.log);
        }

        return super.observe(prevDom, dom);
    }

    findElems = (_dom: AdaptElementOrNull): PlaybookElement[] => {
        if (!this.playbooks) throw new Error(`Ansible plugin: playbooks not initialized yet`);
        return this.playbooks;
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
    getWidgetIdFromElem = (_el: PlaybookElement): string => {
        // Unclear where we might get this
        return "FIXME_MRT_ID";
    }

    needsUpdate = (_el: PlaybookElement, _obs: PlaybookObs): UpdateType => {
        // FIXME(mark)
        return UpdateType.modify;
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
