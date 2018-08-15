import Adapt, {
    Action,
    AdaptElement,
    AdaptElementOrNull,
    AnyProps,
    BuiltinProps,
    findElementsInDom,
    isMountedElement,
    Style
} from "@usys/adapt";
import jsonStableStringify = require("json-stable-stringify");
import * as ld from "lodash";
//import * as when from "when";

import { isResourceElement, Kind, Metadata, PodSpec, Resource, ResourceProps, Spec } from ".";

// Typings are for deprecated API :(
// tslint:disable-next-line:no-var-requires
const k8s = require("kubernetes-client");

interface MetadataInResourceObject extends Required<Metadata> {
    name: string;
}

interface MetadataInRequest extends Metadata {
    name: string;
}

interface ResourceObject {
    kind: Kind;
    metadata: MetadataInResourceObject;
    spec: Spec;
    status: { phase: string };
}

interface Client {
    api?: { v1: any };
    loadSpec(): Promise<void>;
}

interface Observations {
    [kubeconfig: string]: ResourceObject[];
}

export interface K8sPlugin extends Adapt.Plugin<Observations> { }

export function createK8sPlugin() {
    return new K8sPluginImpl();
}

async function getClientForConfigJSON(
    kubeconfigJSON: string,
    options: { connCache: Connections }): Promise<Client> {

    const kubeconfig = JSON.parse(kubeconfigJSON);

    let client = options.connCache.get(kubeconfig);
    if (client === undefined) {
        const k8sConfig = k8s.config.fromKubeconfig(kubeconfig);
        client = new k8s.Client({ config: k8sConfig }) as Client;
        await client.loadSpec();
        options.connCache.set(kubeconfig, client);
    }

    return client;
}

function kindToAPIPathPart(kind: Kind): string {
    const knownResourceKinds = {
        Pod: "pods",
    };

    return knownResourceKinds[kind];
}

async function getResourcesByKind(client: Client, namespaces: string[], kind: Kind): Promise<ResourceObject[]> {
    if (client.api == null) throw new Error("Must initialize client before calling api");
    const ret: ResourceObject[] = [];

    for (const ns of namespaces) {
        const resources = await client.api.v1.namespaces(ns)[kindToAPIPathPart(kind)].get();
        if (resources.statusCode === 200) {
            ret.push(...resources.body.items.map((resObj: ResourceObject) => {
                resObj.kind = kind;
                return resObj;
            }));
        } else {
            throw new Error(`Unable to get ${kind} resources from namespace ${ns}, ` +
                `status ${resources.statusCode}: ${resources}`);
        }
    }
    return ret;
}

async function getResources(client: Client, namespaces?: string[]): Promise<ResourceObject[]> {
    const ret = [];
    namespaces = ld.uniq(namespaces);
    if (namespaces === undefined || namespaces.length === 0) namespaces = ["default"];

    for (const kind in Kind) {
        if (!Kind.hasOwnProperty(kind)) continue;
        ret.push(...await getResourcesByKind(client, namespaces, Kind[kind] as Kind)); //why is the "as Kind" needed?
    }
    return ret;
}

function findResObjsInObs(
    elem: AdaptElement<ResourceProps>,
    observations: Observations): ResourceObject | undefined {

    const configJSON = canonicalConfigJSON(elem.props.config);

    const obs = observations[configJSON];
    if (obs === undefined) return undefined;

    if (!isMountedElement(elem)) throw new Error("Can only compute name for mounted elements!");
    return obs.find((res) =>
        resourceElementToName(elem) === res.metadata.name &&
        elem.props.kind === res.kind);
}

function observedResources(observations: Observations): { configJSON: string, reply: ResourceObject }[] {
    const ret: { configJSON: string, reply: ResourceObject }[] = [];

    for (const configJSON in observations) {
        if (!observations.hasOwnProperty(configJSON)) continue;
        for (const item of observations[configJSON]) {
            ret.push({ configJSON, reply: item });
        }
    }

    return ret;
}

function resourceShouldExist(
    runningState: { configJSON: string, reply: ResourceObject },
    resElems: AdaptElement<ResourceProps>[]): boolean {

    return resElems.find((elem) => {
        if (!isMountedElement(elem)) throw new Error("Can only compare mounted Resource elements to running state");
        const canonicalJSON = canonicalConfigJSON(elem.props.config);
        if (runningState.configJSON !== canonicalJSON) return false;
        return resourceElementToName(elem) === runningState.reply.metadata.name;
    }) !== undefined;
}

const rules = <Style>{Resource} {Adapt.rule()}</Style>;

function findResourceElems(dom: AdaptElementOrNull): AdaptElement<ResourceProps & Adapt.BuiltinProps>[] {
    const candidateElems = findElementsInDom(rules, dom);
    return ld.compact(candidateElems.map((e) => isResourceElement(e) ? e : null));
}

const knownContainerPaths = [
    "name",
    "args",
    "command",
    "image"
];

const knownPodSpecPaths = [
    "containers",
    "terminationGracePeriodSeconds"
];

interface Manifest {
    apiVersion: "v1" | "v1beta1" | "v1beta2";
    kind: Kind;
    metadata: MetadataInRequest;
    spec: Spec;
}

export function resourceElementToName(elem: Adapt.AdaptElement<AnyProps>): string {
    if (!isResourceElement(elem)) throw new Error("Can only compute name of Resource elements");
    if (!isMountedElement(elem)) throw new Error("Can only compute name of mounted elements");
    return "fixme-manishv-" + Buffer.from(elem.id).toString("hex");
}

function makeManifest(elem: AdaptElement<ResourceProps>): Manifest {
    if (!isMountedElement(elem)) throw new Error("Can only create manifest for mounted elements!");

    return {
        apiVersion: "v1",
        kind: elem.props.kind,
        metadata: { ...elem.props.metadata, name: resourceElementToName(elem) },
        spec: elem.props.spec
    };
}

class Connections {

    private static toKey(elemOrConfig: AdaptElement<ResourceProps> | any) {
        let config = elemOrConfig;
        if (Adapt.isElement(elemOrConfig)) {
            const res = elemOrConfig;
            if (!isResourceElement(res)) throw new Error("Cannot lookup connection for non-resource elements");
            config = res.props.config;
        }

        if (!ld.isObject(config)) throw new Error("Cannot lookup connection for non-object resource configs");
        return canonicalConfigJSON(config);
    }

    private connections: Map<string, Client> = new Map<string, Client>();

    get(elem: AdaptElement<ResourceProps>): Client | undefined {
        const key = Connections.toKey(elem);
        return this.connections.get(key);
    }

    set(elem: AdaptElement<ResourceProps>, client: Client) {
        const key = Connections.toKey(elem);
        this.connections.set(key, client);
    }
}

//Exported for tests only
export function canonicalConfigJSON(config: any) {
    return jsonStableStringify(config); //FIXME(manishv) Make this truly canonicalize based on data.
}

enum K8sAction {
    none = "None",
    creating = "Creating",
    replacing = "Replacing",
    updating = "Updating",
    destroying = "Destroying"
}

//FIXME(manishv) somehow generate comparison for all kinds here

function podSpecsEqual(spec1: PodSpec, spec2: PodSpec) {
    function processContainers(spec: PodSpec) {
        if (spec.containers === undefined) return;
        spec.containers = spec.containers
            .map((c) => ld.pick(c, knownContainerPaths) as any);
        spec.containers = ld.sortBy(spec.containers, (c) => c.name);
    }
    const s1 = ld.pick(spec1, knownPodSpecPaths) as PodSpec;
    const s2 = ld.pick(spec2, knownPodSpecPaths) as PodSpec;
    processContainers(s1);
    processContainers(s2);

    return ld.isEqual(s1, s2);
}

function specsEqual(kind: Kind, spec1: Spec, spec2: Spec) {
    switch (kind) {
        case Kind.pod:
            return podSpecsEqual(spec1 as PodSpec, spec2 as PodSpec);
    }
}

function getResourceElementNamespace(elem: AdaptElement<ResourceProps>) {
    const ns = elem.props.metadata && elem.props.metadata.namespace;
    if (ns === undefined) return "default";
    return ns;
}

function getResourceKind(res: ResourceObject) {
    switch (res.kind) {
        case "Pod":
            return Kind.pod;
        default:
            return;
    }
}

function computeActionExceptDelete(
    res: AdaptElement<ResourceProps & BuiltinProps>,
    obs: Observations,
    connCache: Connections): Action | undefined {

    const resObj = findResObjsInObs(res, obs);
    const configJSON = canonicalConfigJSON(res.props.config);
    const manifest = makeManifest(res);
    const apiName = kindToAPIPathPart(res.props.kind);
    const ns = getResourceElementNamespace(res);

    if (resObj === undefined) {
        return {
            description: `${K8sAction.creating} ${res.props.kind} ${res.props.key}`,
            act: async () => {
                const client = await getClientForConfigJSON(configJSON, { connCache });
                if (client.api === undefined) throw new Error("Internal Error");
                await client.api.v1.namespaces(ns)[apiName].post({ body: manifest });
            }
        };
    }

    const kind = getResourceKind(resObj);
    if (kind == null) {
        throw new Error(`Cannot create action for unknown kind ${resObj.kind}`);
    }

    if (specsEqual(kind, resObj.spec, manifest.spec)) return;

    return {
        description: `${K8sAction.replacing} ${res.props.kind} ${res.props.key}`,
        act: async () => {
            const client = await getClientForConfigJSON(configJSON, { connCache });
            if (client.api === undefined) throw new Error("Internal Error");

            await client.api.v1.namespaces(ns)[apiName](resourceElementToName(res)).delete();
            await client.api.v1.namespaces(ns)[apiName].post({ body: manifest });
        }
    };
}

function notUndef(x: string | undefined): x is string {
    return x !== undefined;
}

class K8sPluginImpl implements K8sPlugin {
    logger?: ((...args: any[]) => void);
    connCache: Connections = new Connections();

    async start(options: Adapt.PluginOptions) {
        this.logger = options.log;
    }

    async observe(oldDom: AdaptElementOrNull, dom: AdaptElementOrNull): Promise<Observations> {
        const newElems = findResourceElems(dom);
        const oldElems = findResourceElems(oldDom);
        const allElems = newElems.concat(oldElems);

        const configs = ld.uniq(allElems.map((elem) => canonicalConfigJSON(elem.props.config)));
        const clients = await Promise.all(configs.map(async (config) => ({
            config,
            client: await getClientForConfigJSON(config, { connCache: this.connCache })
        })));

        const namespaces =
            ld.filter(
                allElems.map((e) => e.props.metadata && e.props.metadata.namespace),
                notUndef);

        const existingResourcesP =
            clients.map(async (c) => ({
                config: c.config,
                resources: await getResources(c.client, namespaces)
            }));
        const existingResources = await Promise.all(existingResourcesP);
        const ret: Observations = {};
        for (const { config, resources } of existingResources) {
            ret[config] = resources;
        }
        return ret;
    }

    analyze(_oldDom: AdaptElementOrNull, dom: AdaptElementOrNull, obs: Observations): Adapt.Action[] {
        const newElems = findResourceElems(dom);

        const ret: Adapt.Action[] = [];
        for (const elem of newElems) {
            const action = computeActionExceptDelete(elem, obs, this.connCache);
            if (action !== undefined) {
                ret.push(action);
            }
        }

        for (const { configJSON, reply } of observedResources(obs)) {
            if (resourceShouldExist({ configJSON, reply }, newElems)) continue;
            const apiName = kindToAPIPathPart(reply.kind);

            ret.push({
                description: `Destroying ${reply.kind} ${reply.metadata.name}`,
                act: async () => {
                    const client = await getClientForConfigJSON(configJSON, { connCache: this.connCache });
                    if (client.api == null) throw new Error("Action uses uninitialized client");
                    await client.api.v1.namespaces(reply.metadata.namespace)[apiName](reply.metadata.name).delete();
                }
            });
        }

        return ret;
    }

    async finish() {
        this.logger = undefined;
    }

}
