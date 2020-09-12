/*
 * Copyright 2020 Unbounded Systems, LLC
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

import Adapt, { AdaptElement, BuildData, gql, ObserveForStatus, SFCBuildProps, SFCDeclProps } from "@adpt/core";
import { mapValues } from "lodash";
import { isBuffer } from "util";
import {
    ClusterInfo,
    computeNamespaceFromMetadata,
    Metadata,
    ResourceProps,
    ResourcePropsWithConfig,
    ResourceSecret
} from "./common";
import { K8sObserver } from "./k8s_observer";
import { Manifest, registerResourceKind, resourceIdToName } from "./manifest_support";
import { Resource } from "./Resource";

/**
 * Props for the {@link k8s.Secret} resource
 *
 * @public
 */
interface SecretProps {
     /** Information about the k8s cluster (ip address, auth info, etc.) */
    config: ClusterInfo;

    /** k8s metadata */
    metadata: Metadata;

    /**
     * Data contains the secret data.
     *
     * Each key must consist of alphanumeric characters, '-', '_' or '.'.
     * The serialized form of the secret data is a base64 encoded string, representing the arbitrary
     * (possibly non-string) data value here. Described in {@link https://tools.ietf.org/html/rfc4648#section-4}.
     *
     * @remarks
     *
     *  {@link k8s.Secret} will base64 encode all buffer data, but leave the string data intact.  It
     * is up to the user of {@link k8s.Secret | Secret} to mak sure the string is a valid base64
     * encoding.
     */
    data: { [key: string]: string | Buffer };

    /**
     * stringData allows specifying non-binary secret data in string form.
     *
     * It is provided as a write-only convenience method. All keys and values are merged into the data field on write,
     * overwriting any existing values. It is never output when reading from the API.
     */
    stringData: { [key: string]: string };

    /**
     * Used to facilitate programmatic handling of secret data.
     */
    type?: string;
}

const defaultProps = {
    metadata: {},
    data: {},
    stringData: {},
};

/**
 * k8s Secret resource
 *
 * @param propsIn - props for Secret as specifed in {@link k8s.SecretProps}
 *
 * @public
 */
export function Secret(propsIn: SFCDeclProps<SecretProps, typeof defaultProps>) {
    const {
        key,
        config,
        metadata,
        data,
        stringData,
        type
    } = propsIn as SFCBuildProps<SecretProps, typeof defaultProps>;
    const dataLL = mapValues(data, (v) => isBuffer(v) ? v.toString("base64") : v);

    return <Resource
        key={key}
        kind="Secret"
        config={config}
        metadata={metadata}
        data={dataLL}
        stringData={stringData}
        type={type}
    />;
}
(Secret as any).defaultProps = defaultProps;

/** @internal */
export const secretResourceInfo = {
    kind: "Secret",
    deployedWhen: () => true as const,
    statusQuery: async (props: ResourcePropsWithConfig, observe: ObserveForStatus, buildData: BuildData) => {
        const obs: any = await observe(K8sObserver, gql`
            query ($name: String!, $kubeconfig: JSON!, $namespace: String!) {
                withKubeconfig(kubeconfig: $kubeconfig) {
                    readCoreV1NamespacedSecret(name: $name, namespace: $namespace) @all(depth: 100)
                }
            }`,
            {
                name: resourceIdToName(props.key, buildData.id, buildData.deployID),
                kubeconfig: props.config.kubeconfig,
                namespace: computeNamespaceFromMetadata(props.metadata)
            }
        );
        return obs.withKubeconfig.readCoreV1NamespacedSecret;
    },
    makeManifest: (manifest: Manifest, elem: AdaptElement<ResourceProps>, _deployID: string) => {
        const { data, stringData, type} = elem.props as ResourceSecret;
        return {
            ...manifest,
            data,
            stringData,
            type
        };
    }
};

registerResourceKind(secretResourceInfo);
