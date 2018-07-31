import Adapt, { AdaptElement, AnyProps, findElementsInDom, isMountedElement, Style } from "@usys/adapt";
import * as ld from "lodash";
//import * as when from "when";

import { isContainerElement, Pod, PodProps } from ".";

// Typings are for deprecated API :(
// tslint:disable-next-line:no-var-requires
const k8s = require("kubernetes-client");

interface PodReplyItem {
    metadata: { name: string, namespace: string, labels: any[]; };
    spec: { containers: any[] };
    status: { phase: string };
}

interface Client {
    api?: { v1: any };
    loadSpec(): Promise<void>;
}

export interface PodPlugin extends Adapt.Plugin {
    observations?: Observations;
}

export function createPodPlugin() {
    return new PodPluginImpl();
}

function isPodElement(e: AdaptElement): e is AdaptElement<PodProps & Adapt.BuiltinProps> {
    return e.componentType === Pod;
}

async function getPodClient(
    podIn: AdaptElement<AnyProps>,
    options: { connCache: Connections }): Promise<Client> {

    const pod = isPodElement(podIn) ? podIn : undefined;
    if (pod == null) throw new Error("Element is not a pod");

    let client = options.connCache.get(pod);
    if (client === undefined) {
        client = new k8s.Client({ config: pod.props.config }) as Client;
        await client.loadSpec();
        options.connCache.set(pod, client);
    }

    return client;
}

type Observations = Map<Client, PodReplyItem[]>;

async function getPods(client: Client): Promise<PodReplyItem[]> {
    if (client.api == null) throw new Error("Must initialize client before calling api");

    const pods = await client.api.v1.namespaces("default").pods.get();
    if (pods.statusCode === 200) {
        return pods.body.items as PodReplyItem[];
    }
    throw new Error(`Unable to get pods, status ${pods.statusCode}: ${pods}`);
}

function alreadyExists(
    pod: AdaptElement<PodProps>,
    observations: Observations,
    connections: Connections): boolean {

    const client = connections.get(pod.props.config);
    if (client === undefined) return false;

    const obs = observations.get(client);
    if (obs === undefined) return false;

    if (!isMountedElement(pod)) throw new Error("Can only compute name for mounted elements!");
    const item = obs.find((i) => podElementToName(pod) === i.metadata.name);

    return item !== undefined;
}

function observedPods(observations: Observations): { client: Client, podStatus: PodReplyItem }[] {
    const ret: { client: Client, podStatus: PodReplyItem }[] = [];

    for (const entry of observations.entries()) {
        for (const item of entry[1]) {
            ret.push({ client: entry[0], podStatus: item });
        }
    }

    return ret;
}

function podMatchesStatus(
    status: { client: Client, podStatus: PodReplyItem },
    pods: AdaptElement<PodProps>[], connections: Connections): boolean {

    return pods.find((pod) => {
        if (!isMountedElement(pod)) throw new Error("Can only compare mounted pod elements to running state");
        const podClient = connections.get(pod);
        if (status.client !== podClient) return false;
        return podElementToName(pod) === status.podStatus.metadata.name;
    }) !== undefined;
}

const rules = <Style>{Pod} {Adapt.rule()}</Style>;

function findPods(dom: AdaptElement): AdaptElement<PodProps & Adapt.BuiltinProps>[] {
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
        return JSON.stringify(config);
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

export class PodPluginImpl implements PodPlugin {
    logger?: ((...args: any[]) => void);
    connections: Connections = new Connections();
    observations?: Map<Client, PodReplyItem[]>;

    async start(options: Adapt.PluginOptions) {
        this.logger = options.log;
        this.observations = new Map<Client, PodReplyItem[]>();
    }

    async observe(dom: AdaptElement): Promise<void> {
        const pods = findPods(dom);
        if (this.observations == null) throw new Error("Plugin users should call start before observe");

        const clients = ld.uniq(
            await Promise.all(pods.map((pod) =>
                getPodClient(pod, { connCache: this.connections }))));

        //FIXME(manishv)  This is broken, what if no pods from an old cluster are left in the dom?
        const runningPods = await Promise.all(clients.map(async (client) => ({ client, pods: await getPods(client) })));
        for (const runningPod of runningPods) {
            this.observations.set(runningPod.client, runningPod.pods);
        }
        return;
    }

    analyze(dom: AdaptElement): Adapt.Action[] {
        const pods = findPods(dom);
        if (this.observations == null) throw new Error("Plugin users should call observe before analyze");

        const ret: Adapt.Action[] = [];
        for (const pod of pods) {
            const action = alreadyExists(pod, this.observations, this.connections) ? "Updating" : "Creating";

            ret.push({
                description: `${action} pod ${pod.props.key}`,
                act: async () => {
                    const client = await getPodClient(pod, { connCache: this.connections });
                    const podSpec = makePodManifest(pod);
                    if (client.api === undefined) throw new Error("Internal Error");
                    await client.api.v1.namespaces("default").pods.post({ body: podSpec });
                }
            });
        }

        for (const { client, podStatus } of observedPods(this.observations)) {
            if (podMatchesStatus({ client, podStatus }, pods, this.connections)) continue;
            ret.push({
                description: `Destroying pod ${podStatus.metadata.name}`,
                act: async () => {
                    if (client.api == null) throw new Error("Action uses uninitialized client");
                    await client.api.v1.namespaces("default").pods(podStatus.metadata.name).delete();
                }
            });
        }

        return ret;
    }

    async finish() {
        this.logger = undefined;
        this.observations = undefined;
    }

}
