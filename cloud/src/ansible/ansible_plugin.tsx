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
import { Logger, mkdtmp, removeUndef } from "@usys/utils";
import * as execa from "execa";
import * as fs from "fs-extra";
import { compact } from "lodash";
import * as path from "path";

import {
    AnsibleHost,
    AnsiblePlaybook,
    AnsiblePlaybookProps,
    isPlaybookPrimitiveElement,
} from "./AnsiblePlaybook";

interface AnsibleHostSecret {
    ansible_ssh_pass?: string;
    ansible_ssh_private_key?: string;
}

interface PlaybookObs {

}

type AnsibleQueryDomain = QueryDomain<AnsibleHost, AnsibleHostSecret>;
type PlaybookElement = AdaptElement<AnsiblePlaybookProps>;
type PlaybookPair = WidgetPair<PlaybookElement, PlaybookObs>;

export function findPlaybookElems(dom: AdaptElementOrNull): PlaybookElement[] {
    const rules = <Style>{AnsiblePlaybook} {Adapt.rule()}</Style>;
    const candidateElems = findElementsInDom(rules, dom);
    return compact(candidateElems.map((e) => isPlaybookPrimitiveElement(e) ? e : null));
}

function queryDomain(pbEl: PlaybookElement): AnsibleQueryDomain {
    const host: any = pbEl.props.ansibleHost;
    if (host == null)  throw new Error(`Required Ansible host information not set`);

    // Pull the secrets out of host, if they exist.
    const { ansible_ssh_pass, ansible_ssh_private_key, ...rest } = host;

    const secret = removeUndef({
        ansible_ssh_pass,
        ansible_ssh_private_key,
    });
    return { id: rest, secret };
}

function getHost(domain: AnsibleQueryDomain) {
    if ((domain.id.ansible_connection === "local") ||
        (domain.id.ansible_host == null)) {
        return "localhost";
    }
    return domain.id.ansible_host;
}

async function writeInventory(domain: AnsibleQueryDomain, tmpdir: string) {
    const invFile = path.join(tmpdir, "inventory");

    let line = getHost(domain);
    append(domain.id, "ansible_connection");
    append(domain.id, "ansible_host");
    append(domain.id, "ansible_port");
    append(domain.id, "ansible_user");
    append(domain.id, "ansible_docker_extra_args");
    append(domain.secret, "ansible_ssh_pass");

    if (domain.secret.ansible_ssh_private_key) {
        const keyFile = path.join(tmpdir, "key");
        await fs.writeFile(keyFile, domain.secret.ansible_ssh_private_key,
            { mode: 0o600 });
        line += ` ansible_ssh_private_key_file=${keyFile}`;
    }

    await fs.writeFile(invFile, line, { mode: 0o600 });

    return invFile;

    function append(obj: any, key: string) {
        if (obj[key]) line += ` ${key}=${obj[key]}`;
    }
}

async function execPlaybook(domain: AnsibleQueryDomain, el: PlaybookElement,
    log: Logger, _deployID: string) {
    const args = [];
    const tmpdir = await mkdtmp("adapt-ansible");

    try {
        const invFile = await writeInventory(domain, tmpdir);

        if (el.props.vars != null) {
            const varsFile = path.join(tmpdir, "extra_vars");
            await fs.writeJson(varsFile, el.props.vars);
            args.push("-e", "@" + varsFile);
        }

        args.push("-i", invFile, el.props.playbookFile);

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
        await fs.remove(tmpdir);
    }
}

// Exported for testing
export class AnsiblePluginImpl
    extends WidgetPlugin<PlaybookElement, PlaybookObs, AnsibleQueryDomain> {

    findElems = (dom: AdaptElementOrNull): PlaybookElement[] => {
        return findPlaybookElems(dom);
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
        domain: AnsibleQueryDomain,
        deployID: string,
        resource: PlaybookPair): Promise<void> => {

        const el = resource.element;
        if (!el) throw new Error(`resource element null`);

        await execPlaybook(domain, el, this.log, deployID);
    }

    destroyWidget = async (
        _domain: AnsibleQueryDomain,
        _deployID: string,
        _resource: PlaybookPair): Promise<void> => {

        // FIXME(mark): What exactly am I deleting?
        //await execPlaybook(domain, resource.observed??, deployID, { state="absent" });
    }

    modifyWidget = async (
        domain: AnsibleQueryDomain,
        deployID: string,
        resource: PlaybookPair): Promise<void> => {

        const el = resource.element;
        if (!el) throw new Error(`resource element null`);

        await execPlaybook(domain, el, this.log, deployID);
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
