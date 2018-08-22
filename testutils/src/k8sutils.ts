import { sleep } from "@usys/utils";
import { filter } from "lodash";

// tslint:disable-next-line:no-var-requires
const k8s = require("kubernetes-client");

export interface AnyObj {
    [key: string]: any;
}
export type KubeConfig = AnyObj;
export type KubeClient = AnyObj;
export type K8sConfig = AnyObj;

export async function getClient(config: KubeConfig): Promise<KubeClient> {
    const client = new k8s.Client({ config });
    await client.loadSpec();
    if (client.api == null) throw new Error(`k8s client api is null`);
    return client;
}

export function getK8sConfig(kubeConfig: KubeConfig): K8sConfig {
    return k8s.config.fromKubeconfig(kubeConfig);
}

/*
 * General resource utilities
 */

export async function getAllWithClient(apiName: string, client: KubeClient) {
    if (client.api == null) throw new Error(`k8s client api is null`);
    const response = await client.api.v1.namespaces("default")[apiName].get();
    if (response.statusCode !== 200) {
        throw new Error(`k8s client returned status ${response.statusCode}`);
    }
    const resources: any[] = response.body.items;
    return filter(resources,
                  (r) => r.metadata.annotations && r.metadata.annotations.adaptName);
}

export async function deleteAll(apiName: string, k8sConfig: K8sConfig, waitTimeMs = 15000) {
    const client = await getClient(k8sConfig);
    let resources = await getAllWithClient(apiName, client);
    if (resources.length === 0) return;

    for (const r of resources) {
        await client.api.v1.namespaces("default")[apiName](r.metadata.name).delete();
    }

    do {
        resources = await getAllWithClient(apiName, client);
        if (resources.length === 0) return;
        await sleep(1000);
        waitTimeMs -= 1000;
    } while (waitTimeMs > 0);

    throw new Error(`Failed to remove ${apiName}: ${JSON.stringify(resources, null, 2)}`);
}

export async function getAll(apiName: string, config: KubeConfig) {
    const client = await getClient(config);
    return getAllWithClient(apiName, client);
}

/*
 * Legacy: Pods
 */

export async function getPods(config: KubeConfig) {
    const client = await getClient(config);
    return getPodsWithClient(client);
}
export async function getPodsWithClient(client: KubeClient) {
    return getAllWithClient("pods", client);
}
export async function deleteAllPods(k8sConfig: K8sConfig) {
    return deleteAll("pods", k8sConfig);
}
