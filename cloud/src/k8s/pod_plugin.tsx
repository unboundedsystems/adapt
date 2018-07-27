import Adapt, { AnyProps, findElementsInDom, Style, UnbsElement } from "@usys/adapt";
import * as ld from "lodash";
//import * as when from ash";when";

import { Pod, PodProps } from ".";

// Typings are for deprecated API :(
// tslint:disable-next-line:no-var-requires
const k8s = require("kubernetes-client");

interface PodReplyItems {
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

type Connections = Map<object, Client>; //config to k8s.Client;

function isPodElement(e: UnbsElement): e is UnbsElement<PodProps> {
    return e.componentType === Pod;
}

async function getPodClient(
    podIn: UnbsElement<AnyProps>,
    options: { connCache: Connections }): Promise<Client> {

    const pod = isPodElement(podIn) ? podIn : undefined;
    if (pod == null) throw new Error("Element is not a pod");

    const config = pod.props.config;
    let client = options.connCache.get(config);
    if (client === undefined) {
        client = new k8s.Client({ config }) as Client;
        await client.loadSpec();
    }

    return client;
}

type Observations = Map<Client, PodReplyItems[]>;

async function getPods(client: Client): Promise<PodReplyItems[]> {
    if (client.api == null) throw new Error("Must initialize client before calling api");

    const pods = await client.api.v1.namespaces("default").pods.get();
    if (pods.statusCode === 200) {
        return pods.body.items as PodReplyItems[];
    }
    throw new Error(`Unable to get pods, status ${pods.statusCode}: ${pods}`);
}

function alreadyExists(_pod: UnbsElement, _observations: Observations): boolean {
    return false;
}

function observedPods(_observations: Observations): { client: Client, podStatus: PodReplyItems }[] {
    return []; //FIXME(manishv) do something here
}

function podMatchesStatus(_podStatus: PodReplyItems, _pods: UnbsElement<PodProps>[]): boolean {
    return true; //FIXME(manishv) do something here
}

const rules = <Style>{Pod} {Adapt.rule()}</Style>;

function findPods(dom: UnbsElement): UnbsElement<PodProps>[] {
    const candidatePods = findElementsInDom(rules, dom);
    return ld.compact(candidatePods.map((e) => isPodElement(e) ? e : null));
}

export class PodPluginImpl implements PodPlugin {
    logger?: ((...args: any[]) => void);
    connections: Connections = new Map<object, Client>();
    observations?: Map<Client, PodReplyItems[]>;

    async start(options: Adapt.PluginOptions) {
        this.logger = options.log;
        this.observations = new Map<Client, PodReplyItems[]>();
    }

    async observe(dom: UnbsElement): Promise<void> {
        const pods = findPods(dom);
        if (this.observations == null) throw new Error("Plugin users should call start before observe");

        const clients = ld.uniq(
            await Promise.all(pods.map((pod) =>
                getPodClient(pod, { connCache: this.connections }))));

        const podSpecs = await Promise.all(clients.map(async (client) => ({ client, pods: await getPods(client) })));
        for (const podSpec of podSpecs) {
            this.observations.set(podSpec.client, podSpec.pods);
        }
        return;
    }

    analyze(dom: UnbsElement): Adapt.Action[] {
        const pods = findPods(dom);
        if (this.observations == null) throw new Error("Plugin users should call observe before analyze");

        const ret: Adapt.Action[] = [];
        for (const pod of pods) {
            const action = alreadyExists(pod, this.observations) ? "Updating" : "Creating";

            ret.push({
                description: `${action} pod ${pod.props.name}`,
                act: async () => {
                    const client = await getPodClient(pod, { connCache: this.connections });
                    client;
                    //FIXME(manishv) do the actual operation here
                }
            });
        }

        for (const { client, podStatus } of observedPods(this.observations)) {
            if (podMatchesStatus(podStatus, pods)) continue;
            ret.push({
                description: `Destroying pod ${podStatus.metadata.name}`,
                act: async () => {
                    if (client.api == null) throw new Error("Action uses uninitialized client");
                    await client.api.v1.namespaces("default").pods.delete(podStatus.metadata.name);
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
