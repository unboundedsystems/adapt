/*
 * Copyright 2021 Unbounded Systems, LLC
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
import {
    AggregationRule,
    ClusterInfo,
    Metadata,
    PolicyRule,
    ResourceClusterRole,
    ResourceProps,
    ResourcePropsWithConfig,
} from "./common";
import { K8sObserver } from "./k8s_observer";
import { Manifest, registerResourceKind, resourceIdToName } from "./manifest_support";
import { Resource } from "./Resource";

/**
 * Props for the {@link k8s.ServiceAccount} resource
 *
 * @public
 */
interface ClusterRoleProps {
     /** Information about the k8s cluster (ip address, auth info, etc.) */
    config: ClusterInfo;

    /** k8s metadata */
    metadata: Metadata;
    /**
     * AggregationRule is an optional field that describes how to build the Rules
     * for this ClusterRole.
     *
     * If AggregationRule is set, then the Rules are controller managed and direct
     * changes to Rules will be stomped by the controller.
     */
    aggregationRule?: AggregationRule;
    /**
     * Rules holds all the PolicyRules for this ClusterRole
     */
    rules?: PolicyRule[];
}

const defaultProps = {
    metadata: {}
};

/**
 * k8s ClusterRole resource
 *
 * @param propsIn - props for ServiceAccount as specifed in {@link k8s.ClusterRoleProps}
 *
 * @public
 */
export function ClusterRole(propsIn: SFCDeclProps<ClusterRoleProps, typeof defaultProps>) {
    const {
        handle,
        key,
        config,
        metadata,
        ...rest
    } = propsIn as SFCBuildProps<ClusterRoleProps, typeof defaultProps>;

    return <Resource
        key={key}
        apiVersion="rbac.authorization.k8s.io/v1"
        kind="ClusterRole"
        config={config}
        metadata={metadata}
        {...rest}
    />;
}
// TODO: The "as any" is a workaround for an api-extractor bug. See issue #185.
(ClusterRole as any).defaultProps = defaultProps;

/** @internal */
export const clusterRoleResourceInfo = {
    kind: "ClusterRole",
    deployedWhen: () => true as const,
    statusQuery: async (props: ResourcePropsWithConfig, observe: ObserveForStatus, buildData: BuildData) => {
        const obs: any = await observe(K8sObserver, gql`
            query ($name: String!, $kubeconfig: JSON!) {
                withKubeconfig(kubeconfig: $kubeconfig) {
                    readRbacAuthorizationV1ClusterRole(name: $name) @all(depth: 100)
                }
            }`,
            {
                name: resourceIdToName(props.key, buildData.id, buildData.deployID),
                kubeconfig: props.config.kubeconfig,
            }
        );
        return obs.withKubeconfig.readRbacAuthorizationV1ClusterRole;
    },
    makeManifest: (manifest: Manifest, elem: AdaptElement<ResourceProps>, _deployID: string) => {
        const { aggregationRule, rules } = elem.props as ResourceClusterRole;
        return {
            ...manifest,
            aggregationRule,
            rules,
        };
    }
};

/** @public */
export function isClusterRoleProps(props: ResourceProps): props is ResourceProps & ResourceClusterRole {
    return props.kind === "ClusterRole";
}

registerResourceKind(clusterRoleResourceInfo);
