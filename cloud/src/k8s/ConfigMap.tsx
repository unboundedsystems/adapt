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
    ResourceConfigMap,
    ResourceProps,
    ResourcePropsWithConfig
} from "./common";
import { K8sObserver } from "./k8s_observer";
import { Manifest, registerResourceKind, resourceIdToName } from "./manifest_support";
import { Resource } from "./Resource";

/**
 * Props for the {@link k8s.ConfigMap} resource
 *
 * @public
 */
interface ConfigMapProps {
     /** Information about the k8s cluster (ip address, auth info, etc.) */
    config: ClusterInfo;

    /** k8s metadata */
    metadata: Metadata;

    /**
     * BinaryData contains the binary data.
     *
     * Each key must consist of alphanumeric characters, '-', '_' or '.'.
     * BinaryData can contain byte sequences that are not in the UTF-8 range.
     * The keys stored in BinaryData must not overlap with the ones in the Data field,
     * this is enforced during validation process.
     * Using this field will require 1.10+ apiserver and kubelet.
     *
     * @remarks
     *
     * Note that string values here need to be the base64 encoded version of the data if a string.
     * If a Buffer, the {@link k8s.ConfigMap} component will do the base64 enconding.
     */
    binaryData?: { [key: string]: string | Buffer };
    /**
     * Data contains the configuration data.
     *
     * Each key must consist of alphanumeric characters, '-', '_' or '.'.
     * Values with non-UTF-8 byte sequences must use the BinaryData field.
     * The keys stored in Data must not overlap with the keys in the BinaryData field,
     * this is enforced during validation process.
     */
    data?: { [key: string]: string };

    //tslint:disable max-line-length
    /**
     * Immutable, if set to true, ensures that data stored in the ConfigMap cannot be updated (only object metadata can be modified).
     *
     * If not set to true, the field can be modified at any time. Defaulted to nil.
     * This is a beta field enabled by ImmutableEphemeralVolumes feature gate.
     */
    //tsline:enable max-line-length
    immutable?: boolean;
}

const defaultProps = {
    metadata: {},
};

/**
 * k8s ConfigMap resource
 *
 * @param propsIn - props for ConfigMap as specifed in {@link k8s.ConfigMapProps}
 *
 * @public
 */
export function ConfigMap(propsIn: SFCDeclProps<ConfigMapProps, typeof defaultProps>) {
    const { key, config, metadata, binaryData, data, immutable } = propsIn as SFCBuildProps<ConfigMapProps, typeof defaultProps>;
    const binaryDataLL = mapValues(binaryData, (v) => isBuffer(v) ? v.toString("base64") : v);

    return <Resource
        key={key}
        kind="ConfigMap"
        config={config}
        metadata={metadata}
        binaryData={binaryDataLL}
        data={data ? data : {}}
        immutable={immutable}
    />;
}
(ConfigMap as any).defaultProps = defaultProps;

/** @internal */
export const configMapResourceInfo = {
    kind: "ConfigMap",
    deployedWhen: () => true as const,
    statusQuery: async (props: ResourcePropsWithConfig, observe: ObserveForStatus, buildData: BuildData) => {
        const obs: any = await observe(K8sObserver, gql`
            query ($name: String!, $kubeconfig: JSON!, $namespace: String!) {
                withKubeconfig(kubeconfig: $kubeconfig) {
                    readCoreV1NamespacedConfigMap(name: $name, namespace: $namespace) @all(depth: 100)
                }
            }`,
            {
                name: resourceIdToName(props.key, buildData.id, buildData.deployID),
                kubeconfig: props.config.kubeconfig,
                namespace: computeNamespaceFromMetadata(props.metadata)
            }
        );
        return obs.withKubeconfig.readCoreV1NamespacedConfigMap;
    },
    makeManifest: (manifest: Manifest, elem: AdaptElement<ResourceProps>, _deployID: string) => {
        const { data, binaryData, immutable } = elem.props as ResourceConfigMap;
        return {
            ...manifest,
            data,
            binaryData,
            immutable
        };
    }
};

registerResourceKind(configMapResourceInfo);
