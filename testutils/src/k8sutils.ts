import { sleep } from "@usys/utils";

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

export async function getPodsWithClient(client: KubeClient) {
    if (client.api == null) throw new Error(`k8s client api is null`);
    const pods = await client.api.v1.namespaces("default").pods.get();
    if (pods.statusCode !== 200) {
        throw new Error(`k8s client returned status ${pods.statusCode}`);
    }
    return pods.body.items;
}

export async function getPods(config: KubeConfig) {
    const client = await getClient(config);
    return getPodsWithClient(client);
}

export function getK8sConfig(kubeConfig: KubeConfig): K8sConfig {
    return k8s.config.fromKubeconfig(kubeConfig);
}

export async function deleteAllPods(k8sConfig: K8sConfig) {
    const client = await getClient(k8sConfig);
    let pods = await getPodsWithClient(client);

    for (const pod of pods) {
        await client.api.v1.namespaces("default").pods(pod.metadata.name).delete();
    }

    const retries = 3;
    let count = 0;
    do {
        pods = await getPodsWithClient(client);
        await sleep(5000);
        count++;
    } while (pods.length !== 0 && count < retries);

    if (pods.length !== 0) {
        throw new Error(`Failed to remove pods: ${JSON.stringify(pods, null, 2)}`);
    }
}
