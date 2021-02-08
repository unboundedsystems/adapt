/*
 * Copyright 2019-2021 Unbounded Systems, LLC
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

import { AdaptElement, AdaptMountedElement, AnyProps, Handle, isElement, isHandle, isMountedElement, useState } from "@adpt/core";
import * as yaml from "js-yaml";
import ld from "lodash";
import * as util from "util";
import { DockerSplitRegistryInfo } from "../docker";
import { EnvSimple, mergeEnvSimple } from "../env";
import {
    ClusterInfo,
    Kubeconfig,
    ResourcePod,
    ResourceProps
} from "./common";
import { kubectl } from "./kubectl";
import { isResource, Resource } from "./Resource";

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
    const ret = JSON.parse(json);
    if (ret.clusters === null) ret.clusters = [];
    return ret;
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
        kubeconfig = yaml.safeLoad(configStr) as any; //FIXME(manishv) Put a Kubeconfig schema to validate YAML
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

/** @internal */
export function isResourcePodTemplate(x: any): x is AdaptElement<ResourcePod> {
    if (!isElement(x)) return false;
    if (!isResource(x)) return false;
    if (x.props.apiVersion !== "v1" && x.props.kind === "Pod" && x.props.isTemplate === true) return true;
    return false;
}

function isNotReady<ValT, NotReadyT>(x: ValT | NotReadyT, nr: NotReadyT): x is NotReadyT {
    return ld.isEqual(x, nr);
}

/**
 * Hook that allows a prop to be either an array of handle to k8s resources and values
 *
 * @param initial - initial value of the prop, before the handles are be resolved
 * @param notReady - is a marker value to indicate that a handle's value isn't available yet
 * @param kinds - an array of legal k8s Kinds that a prop handle can point to
 * @param thisResourceName - the name of the resource using the hook, for error messages
 * @param propName - the name of the prop being resolved, again for error messages
 *
 * @returns A two element array, the first element is the current value, the second the update function
 *
 * This hook will start by returning the initial value and an update function that updates
 * the value the hook returns.  The update function takes 2 arguments - the prop value which
 * is an array with a mix of values and handles to be resolved, and a function that receives
 * the elements that any handles point to along with that elements props.  This function
 * can be passed by the caller of update to resolve handles as appropriate for the component.
 *
 * For example, {@link k8s.ClusterRoleBinding} uses this hook to resolve the subjects prop,
 * which is an array of other objects (typically {@link ServiceAccount}) that a particular
 * {@link k8s.ClusterRole} should point to.  When ClusterRoleBinding calls the update method,
 * it passes a function that will convert a {@link k8s.Resource} element of Kind `ServiceAccount`
 * to the underlying `Subject` object that kubernetes expects, namely
 * `{ apiGroup: "", kind: "ServiceAccount", name: resourceIdToName(elem, deployID), namespace: <element namespace> }`
 *
 * @example
 * ```
 * function MyResource({ serviceAccountNames }: { serviceAccountNames: (string | Handle)[]}) {
 *   const { deployID } = useBuildHelpers();
 *   const [ resolvedServiceAccountNames, updateSANs] = useResources({
 *      initial: [],
 *      notReady: null,
 *      kinds: ["ServiceAccount"],
 *      thisResourceName: "MyResources",
 *      propName: "serviceAccountNames",
 *   });
 *
 *   updateSANs(serviceAccountNames, (e, props) => {
 *      return {
 *        apiGroup: (e.metadata.apiVersion?.split("/")[0]) || "",
 *        name: resourceElementToName(e, deployID),
 *        namespace: props.metadata.namespace,
 *      }
 *   });
 *
 *   return null;
 * }
 * ```
 *
 * @beta
 */
export function useResources<ValT, NotReadyT>({
        initial,
        notReady,
        kinds,
        thisResourceName,
        propName,
    }: {
        initial: ValT[],
        notReady: NotReadyT,
        kinds: string[],
        thisResourceName: string,
        propName: string,
    }): [
        (ValT | NotReadyT)[],
        (props: (ValT | Handle)[], f: (e: AdaptMountedElement, props: ResourceProps) => Promise<ValT> | ValT) => void
    ] {
    const [value, updateState] = useState<(ValT | NotReadyT)[]>(initial);
    return [
        value,
        (props: (ValT | Handle)[], f: (e: AdaptMountedElement, props: ResourceProps) => Promise<ValT> | ValT) => {
            updateState(async () => {
                return Promise.all(props.map(async (prop) => {
                    if (!isHandle(prop)) return prop;
                    if (!prop.target) return notReady;
                    if (!isMountedElement(prop.target)) return notReady;

                    if (prop.target.componentType !== Resource) {
                        throw new Error(`${thisResourceName} cannot handle ${propName} of type ${prop.target.componentType.name}`);
                    }
                    const targetProps: ResourceProps = prop.target.props as AnyProps as ResourceProps;
                    if (!kinds.includes(targetProps.kind)) {
                        throw new Error(`${thisResourceName} cannot handle ${propName} of kind ${targetProps.kind}`);
                    }
                    return f(prop.target, targetProps);
                }));
            });
        }
    ];
}

/**
 * Hook to allow conversion of a prop that could be a value or a handle
 *
 * This function behaves similarly to {@link k8s.useResources}, but works for
 * a prop that is either a Handle or a single value instead of an array of
 * Handles and values.
 *
 * See {@link k8s.useResources} for more detailed documentation.
 *
 * @beta
 */
export function useResource<ValT, NotReadyT>(opts: {
        initial: ValT | NotReadyT,
        notReady: NotReadyT,
        kinds: string[],
        thisResourceName: string,
        propName: string,
    }): [
        ValT | NotReadyT,
        (prop: ValT | Handle, f: (e: AdaptMountedElement, props: ResourceProps) => Promise<ValT> | ValT) => void
    ] {
    const [vals, update] = useResources<ValT, NotReadyT>({
        ...opts,
        initial: isNotReady(opts.initial, opts.notReady) ? [] : [opts.initial],
    });
    return [
        vals[0],
        (prop, f) => update([prop], f)
    ];
}
