/*
 * Copyright 2018-2021 Unbounded Systems, LLC
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

import { sleep } from "@adpt/utils";
import { filter } from "lodash";
// tslint:disable-next-line:no-var-requires
const k8s = require("kubernetes-client");
// tslint:disable-next-line: variable-name no-submodule-imports no-var-requires
const Request = require("kubernetes-client/backends/request");

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
    const client = new k8s.Client({ backend: new Request(clientConfig) });
    await client.loadSpec();
    if (client.api == null) throw new Error(`k8s client api is null`);
    return client;
}

export function getK8sConfig(kubeConfig: KubeConfig): K8sConfig {
    return Request.config.fromKubeconfig(kubeConfig);
}

function getClientObj(client: KubeClient, apiPrefix: string) {
    const apiPrefixes = apiPrefix === "" ? [] : apiPrefix.split("/");
    let ret: any = client;
    for (const prefix of apiPrefixes) {
        ret = ret[prefix];
    }
    return ret;
}

async function clientFromOptions(options: ClientOptions): Promise<any> {
    const apiPrefix = (options.apiPrefix === undefined) ? "api/v1" : options.apiPrefix;
    if (options.client) return getClientObj(options.client, apiPrefix);
    if (options.clientConfig) return getClientObj(await getClient(options.clientConfig), apiPrefix);
    throw new Error(`client or clientConfig must be specified`);
}

/*
 * General resource utilities
 */
export interface ClientOptions {
    client?: KubeClient;
    clientConfig?: K8sConfig;
    apiPrefix?: string;
}

export interface GetOptions extends ClientOptions {
    deployID?: string;
    namespaces?: (typeof globalNS | string)[];
    onlyAdapt?: boolean;
}
const getDefaults = {
    deployID: undefined,
    namespaces: ["default"],
    onlyAdapt: true,
};

export const globalNS = Symbol();

export interface DeleteOptions extends ClientOptions {
    deployID?: string;
    namespaces?: (typeof globalNS | string)[];
    onlyAdapt?: boolean;
    waitTimeMs?: number;
}
const deleteDefaults = {
    deployID: undefined,
    namespaces: ["default"],
    onlyAdapt: true,
    waitTimeMs: 15 * 1000,
};

export async function getAll(apiName: string, options: GetOptions) {
    const opts = { ...getDefaults, ...options };
    let resources: any[] = [];
    const client = await clientFromOptions(opts);

    for (const ns of opts.namespaces) {
        const response =
            (ns === globalNS)
                ? await client[apiName].get()
                : await client.namespaces(ns)[apiName].get();
        if (response.statusCode !== 200) {
            throw new Error(`k8s client returned status ${response.statusCode}`);
        }
        resources = resources.concat(response.body.items);
    }

    if (opts.deployID !== undefined) {
        return filter(resources, (r) =>
            r.metadata.annotations &&
            (r.metadata.annotations["adaptjs.org/deployID"] === opts.deployID)
        );
    }
    if (opts.onlyAdapt) {
        return filter(resources, (r) =>
            r.metadata.annotations &&
            (r.metadata.annotations["adaptjs.org/name"] !== undefined)
        );
    }

    return resources;
}

export function getNS(resource: any): string | typeof globalNS {
    const ns = resource && resource.metadata && resource.metadata.namespace;
    if (typeof ns !== "string") return globalNS;
    return ns;
}

export async function deleteAll(apiName: string, options: DeleteOptions) {
    // tslint:disable-next-line:prefer-const
    let { waitTimeMs, ...opts } = { ...deleteDefaults, ...options };
    const client = await clientFromOptions(opts);
    opts.client = client;
    opts.apiPrefix = "";

    let resources = await getAll(apiName, opts);
    if (resources.length === 0) return;

    for (const r of resources) {
        const ns = getNS(r);
        if (ns === globalNS) await client[apiName](r.metadata.name).delete();
        else await client.namespaces(ns)[apiName](r.metadata.name).delete();
    }

    do {
        resources = await getAll(apiName, opts);
        if (resources.length === 0) return;
        await sleep(1000);
        waitTimeMs -= 1000;
    } while (waitTimeMs > 0);

    throw new Error(`Failed to remove ${apiName}: ${JSON.stringify(resources, null, 2)}`);
}
