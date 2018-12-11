import Adapt, {
    AdaptElement,
    AdaptElementOrNull,
    AnyProps,
    BuildData,
    findElementsInDom,
    isMountedElement,
    ObserveForStatus,
    QueryDomain,
    registerPlugin,
    Style,
    UpdateType,
    WidgetPair,
    WidgetPlugin
} from "@usys/adapt";
import { sha256hex } from "@usys/utils";
import jsonStableStringify = require("json-stable-stringify");
import * as ld from "lodash";

import { Kind, Metadata, ResourceBase, Spec } from "./common";
import { isResourceElement, Resource, ResourceProps } from "./Resource";

import { podResourceInfo } from "./Pod";
import { serviceResourceInfo } from "./Service";

// Typings are for deprecated API :(
// tslint:disable-next-line:no-var-requires
const k8s = require("kubernetes-client");

registerPlugin({
    name: "k8s",
    create: createK8sPlugin,
    module
});

type KubeconfigJson = string;

interface MetadataInResourceObject extends Metadata {
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

export interface ResourceInfo {
    kind: Kind;
    apiName: string;
    statusQuery?: (props: ResourceProps, observe: ObserveForStatus, buildData: BuildData) => unknown | Promise<unknown>;
    specsEqual(spec1: Spec, spec2: Spec): boolean;
}

const resourceInfo = {
    [Kind.pod]: podResourceInfo,
    [Kind.service]: serviceResourceInfo,
    // NOTE: ResourceAdd
};

export function getResourceInfo(kind: keyof typeof resourceInfo): ResourceInfo {
    return resourceInfo[kind];
}

async function getClientForConfigJSON(
    kubeconfigJSON: KubeconfigJson,
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

async function getResourcesByKind(
    client: Client,
    namespaces: string[],
    kind: Kind,
    deployID: string
): Promise<ResourceObject[]> {
    if (client.api == null) throw new Error("Must initialize client before calling api");
    const ret: ResourceObject[] = [];
    const info = getResourceInfo(kind);

    for (const ns of namespaces) {
        const resources = await client.api.v1.namespaces(ns)[info.apiName].get();
        if (resources.statusCode === 200) {
            const adaptResources = ld.filter<ResourceObject>(resources.body.items.map((resObj: ResourceObject) => {
                resObj.kind = kind;
                if ((resObj.metadata.annotations === undefined) ||
                    (resObj.metadata.annotations.adaptName === undefined) ||
                    (resObj.metadata.annotations.adaptDeployID !== deployID)) {
                    return undefined;
                }
                return resObj;
            }));

            ret.push(...adaptResources);
        } else {
            throw new Error(`Unable to get ${kind} resources from namespace ${ns}, ` +
                `status ${resources.statusCode}: ${resources}`);
        }
    }
    return ret;
}

async function getResources(client: Client, namespaces: string[], deployID: string): Promise<ResourceObject[]> {
    const ret = [];
    namespaces = ld.uniq(namespaces);
    if (namespaces.length === 0) namespaces = ["default"];

    for (const kind in Kind) {
        if (!Kind.hasOwnProperty(kind)) continue;
        const rs = await getResourcesByKind(client, namespaces,
                                            //why is the "as Kind" needed?
                                            Kind[kind] as Kind, deployID);
        ret.push(...rs);
    }
    return ret;
}

const rules = <Style>{Resource} {Adapt.rule()}</Style>;

function findResourceElems(dom: AdaptElementOrNull): AdaptElement<ResourceProps>[] {
    const candidateElems = findElementsInDom(rules, dom);
    return ld.compact(candidateElems.map((e) => isResourceElement(e) ? e : null));
}

interface Manifest {
    apiVersion: "v1" | "v1beta1" | "v1beta2";
    kind: Kind;
    metadata: MetadataInRequest;
    spec: Spec;
}

export function resourceIdToName(id: string, deployID: string) {
    return "adapt-resource-" + sha256hex(id + deployID).slice(0, 32);
}

export function resourceElementToName(
    elem: Adapt.AdaptElement<AnyProps>,
    deployID: string
): string {
    if (!isResourceElement(elem)) throw new Error("Can only compute name of Resource elements");
    if (!isMountedElement(elem)) throw new Error("Can only compute name of mounted elements");
    return resourceIdToName(elem.id, deployID);
}

function makeManifest(elem: AdaptElement<ResourceProps>, deployID: string): Manifest {
    if (!isMountedElement(elem)) throw new Error("Can only create manifest for mounted elements!");

    const name = resourceElementToName(elem, deployID);
    const ret: Manifest = {
        apiVersion: "v1",
        kind: elem.props.kind,
        metadata: {
            ...elem.props.metadata,
            name
        },
        spec: elem.props.spec
    };

    if (ret.metadata.annotations === undefined) ret.metadata.annotations = {};
    const labels = ret.metadata.labels;
    ret.metadata.labels = { ...(labels ? labels : {}), adaptName: name };
    ret.metadata.annotations.adaptName = elem.id;
    ret.metadata.annotations.adaptDeployID = deployID;

    return ret;
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

function getResourceElementNamespace(elem: AdaptElement<ResourceProps>) {
    const ns = elem.props.metadata && elem.props.metadata.namespace;
    if (ns === undefined) return "default";
    return ns;
}

function compareResource(
    el: AdaptElement<ResourceProps>,
    actual: ResourceObject,
    deployID: string
): UpdateType {
    const info = getResourceInfo(el.props.kind);
    if (info == null) {
        throw new Error(`Cannot create action for unknown kind ${el.props.kind}`);
    }

    const expected = makeManifest(el, deployID);
    if (info.specsEqual(actual.spec, expected.spec)) return UpdateType.none;

    return UpdateType.replace;
}

async function createResource(
    client: Client,
    res: AdaptElement<ResourceProps>,
    deployID: string
): Promise<void> {

    const info = getResourceInfo(res.props.kind);
    if (info == null) {
        throw new Error(`Cannot create action for unknown kind ${res.props.kind}`);
    }
    const manifest = makeManifest(res, deployID);
    const apiName = info.apiName;
    const ns = getResourceElementNamespace(res);

    if (client.api === undefined) throw new Error("Internal Error");
    await client.api.v1.namespaces(ns)[apiName].post({ body: manifest });
}

async function deleteResource(
    client: Client,
    res: ResourceObject
): Promise<void> {
    const info = getResourceInfo(res.kind);
    const apiName = info.apiName;

    if (client.api == null) throw new Error("Action uses uninitialized client");
    await client.api.v1.namespaces(res.metadata.namespace)[apiName](res.metadata.name).delete();
}

function notUndef(x: string | undefined): x is string {
    return x !== undefined;
}

// NOTE(mark): Where is auth information stored for k8s? In kubeconfig?
type K8sQueryDomain = QueryDomain<ResourceBase["config"], null>;
type ResourceElement = AdaptElement<ResourceProps>;
type K8sPair = WidgetPair<AdaptElement<ResourceProps>, ResourceObject>;

class K8sPluginImpl
    extends WidgetPlugin<ResourceElement, ResourceObject, K8sQueryDomain> {

    connCache: Connections = new Connections();

    findElems = (dom: AdaptElementOrNull) => {
        return findResourceElems(dom);
    }
    getElemQueryDomain = (el: ResourceElement) => {
        return { id: el.props.config, secret: null };
    }
    getWidgetTypeFromObs = (obs: ResourceObject): string => {
        return obs.kind;
    }
    getWidgetIdFromObs = (obs: ResourceObject): string => {
        return obs.metadata.name;
    }
    getWidgetTypeFromElem = (el: ResourceElement): string => {
        return el.props.kind;
    }
    getWidgetIdFromElem = (el: ResourceElement): string => {
        return resourceElementToName(el, this.deployID);
    }

    needsUpdate = (el: ResourceElement, obs: ResourceObject): UpdateType => {
        return compareResource(el, obs, this.deployID);
    }

    getObservations = async (
        domain: K8sQueryDomain,
        deployID: string,
        clusterElems: ResourceElement[]
    ): Promise<ResourceObject[]> => {

        const client = await this.getClient(domain);
        const namespaces = ld.filter(
            clusterElems.map((e) => e.props.metadata && e.props.metadata.namespace),
            notUndef);
        return getResources(client, namespaces, deployID);
    }

    createWidget = async (
        domain: K8sQueryDomain,
        deployID: string,
        resource: K8sPair): Promise<void> => {

        const el = resource.element;
        if (!el) throw new Error(`resource element null`);
        const client = await this.getClient(domain);
        await createResource(client, el, deployID);
    }

    destroyWidget = async (
        domain: K8sQueryDomain,
        _deployID: string,
        resource: K8sPair): Promise<void> => {

        const actual = resource.observed;
        if (!actual) throw new Error(`resource observed null`);
        const client = await this.getClient(domain);
        await deleteResource(client, actual);
    }

    modifyWidget = async (
        _domain: K8sQueryDomain,
        _deployID: string,
        _resource: K8sPair): Promise<void> => {
        throw new Error(`Internal error: modify operation not supported`);
    }

    async getClient(domain: K8sQueryDomain) {
        return getClientForConfigJSON(
            canonicalConfigJSON(domain.id), { connCache: this.connCache });
    }
}
