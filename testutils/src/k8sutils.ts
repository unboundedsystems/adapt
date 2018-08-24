import { sleep } from "@usys/utils";
import { filter } from "lodash";

// tslint:disable-next-line:no-var-requires
const k8s = require("kubernetes-client");

export interface AnyObj {
    [key: string]: any;
}
export type KubeConfig = AnyObj;

export interface KubeClient {
    api: AnyObj;
    addCustomResourceDefinition(manifest: object): void;
    loadSpec(): Promise<KubeClient>;
}
export interface K8sConfig {
    url: string;
    auth: any;
    ca: any;
    insecureSkipTlsVerify: any;
    key: any;
    cert: any;
}

export async function getClient(clientConfig: K8sConfig): Promise<KubeClient> {
    const client = new k8s.Client({ config: clientConfig });
    await client.loadSpec();
    if (client.api == null) throw new Error(`k8s client api is null`);
    return client;
}

export function getK8sConfig(kubeConfig: KubeConfig): K8sConfig {
    return k8s.config.fromKubeconfig(kubeConfig);
}

async function clientFromOptions(options: ClientOptions): Promise<KubeClient> {
    if (options.client) return options.client;
    if (options.clientConfig) return getClient(options.clientConfig);
    throw new Error(`client or clientConfig must be specified`);
}

/*
 * General resource utilities
 */
export interface ClientOptions {
    client?: KubeClient;
    clientConfig?: K8sConfig;
}

export interface GetOptions extends ClientOptions {
    onlyAdapt?: boolean;
}
const getDefaults = {
    onlyAdapt: true,
};

export interface DeleteOptions extends ClientOptions {
    onlyAdapt?: boolean;
    waitTimeMs?: number;
}
const deleteDefaults = {
    onlyAdapt: true,
    waitTimeMs: 15 * 1000,
};

export async function getAll(apiName: string, options: GetOptions) {
    const opts = { ...getDefaults, ...options };
    const client = await clientFromOptions(opts);

    const response = await client.api.v1.namespaces("default")[apiName].get();
    if (response.statusCode !== 200) {
        throw new Error(`k8s client returned status ${response.statusCode}`);
    }
    const resources: any[] = response.body.items;
    if (!opts.onlyAdapt) return resources;

    return filter(resources,
                  (r) => r.metadata.annotations && r.metadata.annotations.adaptName);
}

export async function deleteAll(apiName: string, options: DeleteOptions) {
    // tslint:disable-next-line:prefer-const
    let { waitTimeMs, ...opts } = { ...deleteDefaults, ...options };
    const client = await clientFromOptions(opts);
    opts.client = client;

    let resources = await getAll(apiName, opts);
    if (resources.length === 0) return;

    for (const r of resources) {
        await client.api.v1.namespaces("default")[apiName](r.metadata.name).delete();
    }

    do {
        resources = await getAll(apiName, opts);
        if (resources.length === 0) return;
        await sleep(1000);
        waitTimeMs -= 1000;
    } while (waitTimeMs > 0);

    throw new Error(`Failed to remove ${apiName}: ${JSON.stringify(resources, null, 2)}`);
}
