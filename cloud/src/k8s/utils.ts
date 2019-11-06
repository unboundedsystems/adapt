/*
 * Copyright 2019 Unbounded Systems, LLC
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

import * as yaml from "js-yaml";
import ld from "lodash";
import * as util from "util";
import { DockerSplitRegistryInfo } from "../docker";
import { EnvSimple, mergeEnvSimple } from "../env";
import {
    ClusterInfo,
    Kubeconfig
} from "./common";
import { kubectl } from "./kubectl";

/**
 * Options for {@link k8s.makeClusterInfo}
 *
 * @public
 */
export interface MakeClusterInfoOptions {
    /**
     * A Javascript Object representing a valid kubeconfig, or a YAML string, or a path to a kubeconfig file.
     *
     * @remarks
     * If this is a Javascript object, it will be treated like a parsed kubeconfig.  If this is a string,
     * {@link k8s.makeClusterInfo} will first attempt to parse it as JSON.  If that fails, it will attempt
     * to parse it as YAML.  If that fails it will treat the string as a path of configs (like with the `KUBECONFIG`
     * environment variable).
     *
     * If kubeconfig is missing {@link k8s.makeClusterInfo} will use the `KUBECONFIG` environment variable to build
     * a suitable config using `kubectl config view --flatten` and return that as the kubeconfig in the resulting
     * {@link k8s.ClusterInfo}
     */
    kubeconfig?: Kubeconfig | string;
    /**
     * URL to the docker registry that this cluster uses to pull private images.
     *
     * @remarks
     * This is identical to the `registryUrl` field in {@link k8s.ClusterInfo}.  It will
     * be returned verbatim in the resulting {@link k8s.ClusterInfo} object.
     */
    registryUrl?: string | DockerSplitRegistryInfo;
}

async function getKubeconfigFromPath(path: string | undefined): Promise<Kubeconfig> {
    const kenv: EnvSimple = path ? { KUBECONFIG: path } : {};
    const result = await kubectl(["config", "view", "-o", "json", "--flatten"],
        { env: mergeEnvSimple(process.env as EnvSimple, kenv) });
    const json = result.stdout;
    return JSON.parse(json);
}

async function getKubeconfig(configStr: string): Promise<Kubeconfig> {
    const errors: { attempt: string, message: string }[] = [];
    let kubeconfig: Kubeconfig | any[] | string | undefined;

    //JSON
    try {
        kubeconfig = JSON.parse(configStr);
    } catch (e) {
        errors.push({ attempt: "as JSON", message: e.message });
    }
    //FIXME(manishv) better validation of returned data here
    if ((kubeconfig != null) && !ld.isObject(kubeconfig)) {
        throw new Error(`Invalid kubeconfig in JSON from ${configStr}`);
    }
    if (ld.isArray(kubeconfig)) throw new Error(`Invalid array kubeconfig in JSON from ${configStr}`);
    if (kubeconfig !== undefined) return kubeconfig;

    //YAML
    try {
        kubeconfig = yaml.safeLoad(configStr); //FIXME(manishv) Put a Kubeconfig schema to validate YAML
    } catch (e) {
        errors.push({ attempt: "as YAML", message: e.message });
    }
    if ((kubeconfig != null) && !ld.isObject(kubeconfig)) {
        if (ld.isString(kubeconfig)) {
            kubeconfig = undefined; //Try this as a path, since a path will look like a valid YAML
        } else {
            throw new Error(`Invalid kubeconfig in YAML from ${configStr}`);
        }
    }
    if (ld.isArray(kubeconfig)) throw new Error(`Invalid array kubeconfig in YAML from ${configStr}`);
    if (kubeconfig !== undefined) return kubeconfig;

    try {
        return getKubeconfigFromPath(configStr);
    } catch (e) {
        errors.push({ attempt: "from KUBECONFIG", message: e.message });
    }

    throw new Error(errors.map((e) => `Could not get kubeconfig ${e.attempt}:\n${e.message}\n-------\n`).join("\n"));
}

/**
 * Make a {@link k8s.ClusterInfo} object suitable for use with k8s resources
 *
 * @remarks
 *
 * This function will take a set of options and generate a {@link k8s.ClusterInfo}
 * object that contains the kubeconfig, registryUrl for private images, and any other
 * relevant information for the cluster
 *
 * See {@link k8s.MakeClusterInfoOptions} for information on how the information
 * is computed.
 *
 * @returns A {@link k8s.ClusterInfo} object.
 *
 * @public
 */
export async function makeClusterInfo(options: MakeClusterInfoOptions): Promise<ClusterInfo> {
    const registryUrl = options.registryUrl;
    if (options.kubeconfig === undefined) {
        return { kubeconfig: await getKubeconfigFromPath(process.env.KUBECONFIG), registryUrl };
    }
    if (ld.isString(options.kubeconfig)) {
        return { kubeconfig: await getKubeconfig(options.kubeconfig), registryUrl };
    }
    if (ld.isObject(options.kubeconfig)) {
        return { kubeconfig: options.kubeconfig, registryUrl };
    }
    throw new Error(`Illegal kubeconfig option in ${util.inspect(options)}`);
}
