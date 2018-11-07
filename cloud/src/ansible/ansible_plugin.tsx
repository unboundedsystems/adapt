import Adapt, {
    AdaptElement,
    AdaptElementOrNull,
    findElementsInDom,
    QueryDomain,
    registerPlugin,
    Style,
    UpdateType,
    WidgetPair,
    WidgetPlugin,
} from "@usys/adapt";
import { Logger, mkdtmp, ObjectSet } from "@usys/utils";
import * as execa from "execa";
import * as fs from "fs-extra";
import { compact } from "lodash";
import * as path from "path";

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
    console.log(candidateElems);
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

async function execPlaybook(el: PlaybookElement, pluginDir: string,
    log: Logger, _deployID: string) {

    const args = [];
    let tmpdir: string | undefined;

    try {
        if (el.props.vars != null) {
            tmpdir = await mkdtmp("adapt-ansible-playbookdata");
            const varsFile = path.join(tmpdir, "extra_vars");
            await fs.writeJson(varsFile, el.props.vars);
            args.push("-e", "@" + varsFile);
        }

        args.push("-i", inventoryFile(pluginDir), el.props.playbookFile);

        const child = execa("ansible-playbook", args, {
            env: { ANSIBLE_HOST_KEY_CHECKING: "False" },
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

function implicitPlaybookFile(pluginDir: string) {
    return path.join(pluginDir, "implicit_playbook.yaml");
}

function inventoryFile(pluginDir: string) {
    return path.join(pluginDir, "inventory");
}

async function writeImplicitPlaybook(roleEls: RoleElement[], pluginDir: string) {
    const hostRoles = new Map<string, string[]>();

    for (const roleEl of roleEls) {
        const role = roleName(roleEl.props);
        if (!role) throw new Error(`AnsibleRole does not have a role name`);
        const hostname = getHostname(roleEl.props.ansibleHost);
        let list = hostRoles.get(hostname);
        if (!list) {
            list = [];
            hostRoles.set(hostname, list);
        }
        list.push(role);
    }

    /*
     * TODO(mark): Switch to using a YAML writer.
     * Example output:
     * - hosts: webservers
     *   roles:
     *     - common
     *     - webservers
     */
    const lines = [];
    for (const [host, roles] of hostRoles) {
        lines.push(`- hosts: ${host}`);
        lines.push(`  roles:`);
        for (const role of roles) {
            lines.push(`    - ${role}`);
        }
    }
    lines.push("");

    await fs.writeFile(implicitPlaybookFile(pluginDir), lines.join("\n"));
}

function implicitPlaybook(pluginDir: string): PlaybookElement {
    const el =
        <AnsibleImplicitPlaybook playbookFile={implicitPlaybookFile(pluginDir)} />;
    if (!isAnsibleImplicitPlaybookElement(el)) throw new Error(`Internal error`);
    return el;
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
        if (this.roles.length > 0) this.playbooks.push(implicitPlaybook(this.dataDir));

        await writeInventory(this.hosts, this.groups, this.dataDir);
        await writeImplicitPlaybook(this.roles, this.dataDir);

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
        deployID: string,
        resource: PlaybookPair): Promise<void> => {

        const el = resource.element;
        if (!el) throw new Error(`resource element null`);

        await execPlaybook(el, this.dataDir, this.log, deployID);
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
        deployID: string,
        resource: PlaybookPair): Promise<void> => {

        const el = resource.element;
        if (!el) throw new Error(`resource element null`);

        await execPlaybook(el, this.dataDir, this.log, deployID);
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
