/*
 * Copyright 2018-2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Adapt, {
    ActionInfo,
    AdaptElement,
    AdaptElementOrNull,
    AnyProps,
    BuildData,
    ChangeType,
    FinalDomElement,
    findElementsInDom,
    GoalStatus,
    isMountedElement,
    ObserveForStatus,
    QueryDomain,
    registerPlugin,
    Style,
    WaitStatus,
    WidgetChange,
    WidgetPair,
    WidgetPlugin,
} from "@adpt/core";
import { sha256hex } from "@adpt/utils";
import jsonStableStringify = require("json-stable-stringify");
import * as ld from "lodash";

import { Kind, Kubeconfig, Metadata, ResourceBase, ResourceProps, Spec } from "./common";
import { isResourceFinalElement, Resource } from "./Resource";

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
    deployedWhen: (statusObj: unknown, goalStatus: GoalStatus) => WaitStatus;
    statusQuery?: (props: ResourceProps, observe: ObserveForStatus, buildData: BuildData) => any | Promise<any>;
    specsEqual(actual: Spec, element: Spec): boolean;
}

const resourceInfo = new Map<string, ResourceInfo>();

export function getResourceInfo(kind: string): ResourceInfo {
    const info = resourceInfo.get(kind);
    if (!info) throw new Error(`Request for ResourceInfo for unknown kind: ${kind}`);
    return info;
}

export function registerResourceKind(info: ResourceInfo) {
    const old = resourceInfo.get(info.kind);
    if (old !== undefined) throw new Error(`Attempt to register duplicate kind "${info.kind}"`);
    resourceInfo.set(info.kind, info);
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

    for (const kind of resourceInfo.keys()) {
        const rs = await getResourcesByKind(client, namespaces, kind, deployID);
        ret.push(...rs);
    }
    return ret;
}

const rules = <Style>{Resource} {Adapt.rule()}</Style>;

function findResourceElems(dom: AdaptElementOrNull): ResourceElement[] {
    const candidateElems = findElementsInDom(rules, dom);
    return ld.compact(candidateElems.map((e) => isResourceFinalElement(e) ? e : null));
}

interface Manifest {
    apiVersion: "v1" | "v1beta1" | "v1beta2";
    kind: Kind;
    metadata: MetadataInRequest;
    spec: Spec;
}

export function scrubName(name: string) {
    return name.toLowerCase().replace(/[^a-z-]/g, "");
}

export function resourceIdToName(key: string, id: string, deployID: string) {
    return scrubName(key) + "-" + sha256hex(id + deployID).slice(0, 32);
}

export function resourceElementToName(
    elem: Adapt.AdaptElement<AnyProps>,
    deployID: string
): string {
    if (!isResourceFinalElement(elem)) throw new Error("Can only compute name of Resource elements");
    if (!isMountedElement(elem)) throw new Error("Can only compute name of mounted elements");
    return resourceIdToName(elem.props.key, elem.id, deployID);
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

    private static toKey(elemOrConfig: AdaptElement<ResourceProps> | Kubeconfig) {
        let config: Kubeconfig;
        if (Adapt.isElement(elemOrConfig)) {
            const res = elemOrConfig;
            if (!isResourceFinalElement(res)) throw new Error("Cannot lookup connection for non-resource elements");
            config = res.props.config.kubeconfig;
        } else {
            config = elemOrConfig;
        }

        if (!ld.isObject(config)) {
            throw new Error("Cannot lookup connection for non-object resource configs");
        }
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
export function canonicalConfigJSON(config: Kubeconfig) {
    return jsonStableStringify(config); //FIXME(manishv) Make this truly canonicalize based on data.
}

function getResourceElementNamespace(elem: AdaptElement<ResourceProps>) {
    const ns = elem.props.metadata && elem.props.metadata.namespace;
    if (ns === undefined) return "default";
    return ns;
}

function computeResourceChanges(
    change: WidgetChange<ResourceElement>,
    actual: ResourceObject | undefined,
    deployID: string
): ActionInfo {
    const { to, from } = change;
    const kind = (to && to.props.kind) || (from && from.props.kind) || "Unknown Resource Kind";

    // TODO: Ask K8S for detail on resource changes
    const actionInfo = (type: ChangeType, detail: string) => {
        const element = to || from;
        return element ?
            { type, detail, changes: [{ type, element, detail }] } :
            { type, detail, changes: [] };
    };

    if (from == null && to == null) {
        return actionInfo(ChangeType.delete, "Destroying unrecognized Resource");
    }

    if (to == null) {
        return actual ?
            actionInfo(ChangeType.delete, `Destroying removed ${kind}`) :
            actionInfo(ChangeType.none, "No changes required");
    }

    if (actual == null) {
        return actionInfo(ChangeType.create, `Creating ${kind}`);
    }

    const info = getResourceInfo(to.props.kind);
    if (info == null) {
        throw new Error(`Cannot create action for unknown kind ${kind}`);
    }

    const expected = makeManifest(to, deployID);
    if (info.specsEqual(actual.spec, expected.spec)) {
        return actionInfo(ChangeType.none, "No changes required");
    }

    // NOTE: Returning ChangeType.modify means WidgetPlugin calls our
    // modifyWidget function to handle the change. But right now,
    // we don't support a true modify (PATCH) operation, so the description
    // is "Replacing", which is accurate.
    return actionInfo(ChangeType.modify, `Replacing ${kind}`);
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
    res: ResourceObject,
    immediate = false,
): Promise<void> {
    const info = getResourceInfo(res.kind);
    const apiName = info.apiName;
    const opts = immediate ? { body: { gracePeriodSeconds: 0 } } : undefined;

    if (client.api == null) throw new Error("Action uses uninitialized client");
    await client.api.v1
        .namespaces(res.metadata.namespace)[apiName](res.metadata.name)
        .delete(opts);
}

function notUndef(x: string | undefined): x is string {
    return x !== undefined;
}

// NOTE(mark): Where is auth information stored for k8s? In kubeconfig?
type K8sQueryDomain = QueryDomain<ResourceBase["config"]["kubeconfig"], null>;
type ResourceElement = FinalDomElement<ResourceProps>;
type K8sPair = WidgetPair<ResourceElement, ResourceObject>;

class K8sPluginImpl
    extends WidgetPlugin<ResourceElement, ResourceObject, K8sQueryDomain> {

    connCache: Connections = new Connections();

    findElems = (dom: AdaptElementOrNull)  => {
        return findResourceElems(dom);
    }
    getElemQueryDomain = (el: ResourceElement) => {
        return { id: el.props.config.kubeconfig, secret: null };
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

    computeChanges =
        (change: WidgetChange<ResourceElement>, obs: ResourceObject | undefined): ActionInfo => {
        return computeResourceChanges(change, obs, this.deployID);
    }

    getObservations = async (
        domain: K8sQueryDomain,
        deployID: string,
        clusterElems: WidgetChange<ResourceElement>[]
    ): Promise<ResourceObject[]> => {

        const client = await this.getClient(domain);
        const namespaces = clusterElems
            .map((change) => change.to || change.from)
            .map((e) => e && e.props.metadata && e.props.metadata.namespace)
            .filter(notUndef);
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
        domain: K8sQueryDomain,
        deployID: string,
        resource: K8sPair): Promise<void> => {

        const actual = resource.observed;
        if (!actual) throw new Error(`resource observed null`);
        const el = resource.element;
        if (!el) throw new Error(`resource element null`);
        const client = await this.getClient(domain);

        await deleteResource(client, actual, true);
        await createResource(client, el, deployID);
    }

    async getClient(domain: K8sQueryDomain) {
        return getClientForConfigJSON(
            canonicalConfigJSON(domain.id), { connCache: this.connCache });
    }
}
