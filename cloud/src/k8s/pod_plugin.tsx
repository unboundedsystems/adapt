import Adapt, {
    Action,
    AdaptElement,
    AdaptElementOrNull,
    AnyProps,
    BuiltinProps,
    findElementsInDom,
    isMountedElement,
    registerPlugin,
    Style
} from "@usys/adapt";
import jsonStableStringify = require("json-stable-stringify");
import * as ld from "lodash";
//import * as when from "when";

import { isContainerElement, Pod, PodProps } from ".";

// Typings are for deprecated API :(
// tslint:disable-next-line:no-var-requires
const k8s = require("kubernetes-client");

interface PodReplyItem {
    metadata: { name: string, namespace: string, labels: any[]; };
    spec: PodSpec;
    status: { phase: string };
}

interface Client {
    api?: { v1: any };
    loadSpec(): Promise<void>;
}

interface PodObservations {
    [kubeconfig: string]: PodReplyItem[];
}

export interface PodPlugin extends Adapt.Plugin<PodObservations> { }

export function createPodPlugin() {
    return new PodPluginImpl();
}

registerPlugin({
    create: createPodPlugin,
    module
});

function isPodElement(e: AdaptElement): e is AdaptElement<PodProps & Adapt.BuiltinProps> {
    return e.componentType === Pod;
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

async function getPods(client: Client): Promise<PodReplyItem[]> {
    if (client.api == null) throw new Error("Must initialize client before calling api");

    const pods = await client.api.v1.namespaces("default").pods.get();
    if (pods.statusCode === 200) {
        return pods.body.items as PodReplyItem[];
    }
    throw new Error(`Unable to get pods, status ${pods.statusCode}: ${pods}`);
}

function findPodInObs(
    pod: AdaptElement<PodProps>,
    observations: PodObservations): PodReplyItem | undefined {

    const configJSON = canonicalConfigJSON(pod.props.config);

    const obs = observations[configJSON];
    if (obs === undefined) return undefined;

    if (!isMountedElement(pod)) throw new Error("Can only compute name for mounted elements!");
    return obs.find((i) => podElementToName(pod) === i.metadata.name);
}

function observedPods(observations: PodObservations): { configJSON: string, podStatus: PodReplyItem }[] {
    const ret: { configJSON: string, podStatus: PodReplyItem }[] = [];

    for (const configJSON in observations) {
        if (!observations.hasOwnProperty(configJSON)) continue;
        for (const item of observations[configJSON]) {
            ret.push({ configJSON, podStatus: item });
        }
    }

    return ret;
}

function podShouldExist(
    status: { configJSON: string, podStatus: PodReplyItem },
    pods: AdaptElement<PodProps>[]): boolean {

    return pods.find((pod) => {
        if (!isMountedElement(pod)) throw new Error("Can only compare mounted pod elements to running state");
        const canonicalJSON = canonicalConfigJSON(pod.props.config);
        if (status.configJSON !== canonicalJSON) return false;
        return podElementToName(pod) === status.podStatus.metadata.name;
    }) !== undefined;
}

const rules = <Style>{Pod} {Adapt.rule()}</Style>;

function findPods(dom: AdaptElementOrNull): AdaptElement<PodProps & Adapt.BuiltinProps>[] {
    const candidatePods = findElementsInDom(rules, dom);
    return ld.compact(candidatePods.map((e) => isPodElement(e) ? e : null));
}

interface PodSpec {
    containers: {
        name: string;
        args?: string[];
        command?: string[];
        image: string;
    }[];
    terminationGracePeriodSeconds?: number;
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

interface PodManifest {
    apiVersion: "v1" | "v1beta1" | "v1beta2";
    kind: "Pod";
    metadata: {
        name: string,
        labels?: { [key: string]: any }
    };
    spec: PodSpec;
}

export function podElementToName(pod: Adapt.AdaptElement<AnyProps>): string {
    if (!isPodElement(pod)) throw new Error("Can only compute name of Pod elements");
    if (!isMountedElement(pod)) throw new Error("Can only compute name of mounted elements");
    return "fixme-manishv-" + Buffer.from(pod.id).toString("hex");
}

function makePodManifest(pod: AdaptElement<PodProps>): PodManifest {
    if (!isMountedElement(pod)) throw new Error("Can only create pod spec for mounted elements!");
    const containers = ld.compact(
        Adapt.childrenToArray(pod.props.children)
            .map((c) => isContainerElement(c) ? c : null));

    return {
        apiVersion: "v1",
        kind: "Pod",
        metadata: {
            //include deployment name and ensure uniqueness w.r.t unlableled pods
            name: podElementToName(pod),
            labels: {
                adapt_id: podElementToName(pod) //FIXME(manishv) include deployment name in the key
            }
        },
        spec: {
            containers: containers.map((c) => ({
                name: c.props.name,
                image: c.props.image,
                command: c.props.command //FIXME(manishv)  What if we just have args and no command?
            })),
            terminationGracePeriodSeconds: pod.props.terminationGracePeriodSeconds
        }
    };
}

class Connections {

    private static toKey(podOrConfig: AdaptElement<PodProps> | any) {
        let config = podOrConfig;
        if (Adapt.isElement(podOrConfig)) {
            const pod = podOrConfig;
            if (!isPodElement(pod)) throw new Error("Cannot lookup connection for non-pod elements");
            config = pod.props.config;
        }

        if (!ld.isObject(config)) throw new Error("Cannot lookup connection for non-object pod configs");
        return canonicalConfigJSON(config);
    }

    private connections: Map<string, Client> = new Map<string, Client>();

    get(pod: AdaptElement<PodProps>): Client | undefined {
        const key = Connections.toKey(pod);
        return this.connections.get(key);
    }

    set(pod: AdaptElement<PodProps>, client: Client) {
        const key = Connections.toKey(pod);
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

//FIXME(manishv) Use PodSpec swagger and compare all fields of interest
function specsEqual(spec1: PodSpec, spec2: PodSpec) {
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

function computeActionExceptDelete(
    pod: AdaptElement<PodProps & BuiltinProps>,
    obs: PodObservations,
    connCache: Connections): Action | undefined {

    const podItem = findPodInObs(pod, obs);
    const configJSON = canonicalConfigJSON(pod.props.config);
    const manifest = makePodManifest(pod);

    if (podItem === undefined) {
        return {
            description: `${K8sAction.creating} pod ${pod.props.key}`,
            act: async () => {
                const client = await getClientForConfigJSON(configJSON, { connCache });
                if (client.api === undefined) throw new Error("Internal Error");
                await client.api.v1.namespaces("default").pods.post({ body: manifest });
            }
        };
    }

    if (specsEqual(podItem.spec, manifest.spec)) return;

    return {
        description: `${K8sAction.replacing} pod ${pod.props.key}`,
        act: async () => {
            const client = await getClientForConfigJSON(configJSON, { connCache });
            if (client.api === undefined) throw new Error("Internal Error");

            await client.api.v1.namespaces("default").pods(podElementToName(pod)).delete();
            await client.api.v1.namespaces("default").pods.post({ body: manifest });
        }
    };
}

class PodPluginImpl implements PodPlugin {
    logger?: ((...args: any[]) => void);
    connCache: Connections = new Connections();

    async start(options: Adapt.PluginOptions) {
        this.logger = options.log;
    }

    async observe(oldDom: AdaptElementOrNull, dom: AdaptElementOrNull): Promise<PodObservations> {
        const newPods = findPods(dom);
        const oldPods = findPods(oldDom);
        const allPods = newPods.concat(oldPods);

        const configs = ld.uniq(allPods.map((pod) => canonicalConfigJSON(pod.props.config)));
        const clients = await Promise.all(configs.map(async (config) => ({
            config,
            client: await getClientForConfigJSON(config, { connCache: this.connCache })
        })));

        const runningPodsP = clients.map(async (c) => ({ config: c.config, pods: await getPods(c.client) }));
        const runningPods = await Promise.all(runningPodsP);
        const ret: PodObservations = {};
        for (const { config, pods } of runningPods) {
            ret[config] = pods;
        }
        return ret;
    }

    analyze(_oldDom: AdaptElementOrNull, dom: AdaptElementOrNull, obs: PodObservations): Adapt.Action[] {
        const newPods = findPods(dom);

        const ret: Adapt.Action[] = [];
        for (const pod of newPods) {
            const action = computeActionExceptDelete(pod, obs, this.connCache);
            if (action !== undefined) {
                ret.push(action);
            }
        }

        for (const { configJSON, podStatus } of observedPods(obs)) {
            if (podShouldExist({ configJSON, podStatus }, newPods)) continue;
            ret.push({
                description: `Destroying pod ${podStatus.metadata.name}`,
                act: async () => {
                    const client = await getClientForConfigJSON(configJSON, { connCache: this.connCache });
                    if (client.api == null) throw new Error("Action uses uninitialized client");
                    await client.api.v1.namespaces("default").pods(podStatus.metadata.name).delete();
                }
            });
        }

        return ret;
    }

    async finish() {
        this.logger = undefined;
    }

}
