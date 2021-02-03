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
    ClusterInfo,
    computeNamespaceFromMetadata,
    Metadata,
    ObjectReference,
    ResourceProps,
    ResourcePropsWithConfig,
    ResourceServiceAccount
} from "./common";
import { K8sObserver } from "./k8s_observer";
import { Manifest, registerResourceKind, resourceIdToName } from "./manifest_support";
import { Resource } from "./Resource";

/**
 * Props for the {@link k8s.ServiceAccount} resource
 *
 * @public
 */
interface ServiceAccountProps {
     /** Information about the k8s cluster (ip address, auth info, etc.) */
    config: ClusterInfo;

    /** k8s metadata */
    metadata: Metadata;

    /**
     * automountServiceAccountToken indicates whether pods running as this service account
     * should have an API token automatically mounted. Can be overridden at the pod level.
     */
    automountServiceAccountToken?: boolean;

    /**
     * imagePullSecrets is a list of references to secrets in the same namespace to use for
     * pulling any images in pods that reference this ServiceAccount.
     *
     * ImagePullSecrets are distinct from Secrets because Secrets can be mounted in the pod,
     * but ImagePullSecrets are only accessed by the kubelet. '
     *
     * More info: {@link https://kubernetes.io/docs/concepts/containers/images/#specifying-imagepullsecrets-on-a-pod}
     */
    imagePullSecrets?: { name: string }[];

    /**
     * Secrets is the list of secrets allowed to be used by pods running using this ServiceAccount.
     *
     * More info: {@link https://kubernetes.io/docs/concepts/configuration/secret}
     */
    secrets?: ObjectReference[];
}

const defaultProps = {
    metadata: {}
};

/**
 * k8s ServiceAccount resource
 *
 * @param propsIn - props for ServiceAccount as specifed in {@link k8s.ServiceAccountProps}
 *
 * @public
 */
export function ServiceAccount(propsIn: SFCDeclProps<ServiceAccountProps, typeof defaultProps>) {
    const {
        handle,
        key,
        config,
        metadata,
        ...rest
    } = propsIn as SFCBuildProps<ServiceAccountProps, typeof defaultProps>;

    return <Resource
        key={key}
        kind="ServiceAccount"
        config={config}
        metadata={metadata}
        {...rest}
    />;
}
// TODO: The "as any" is a workaround for an api-extractor bug. See issue #185.
(ServiceAccount as any).defaultProps = defaultProps;

/** @internal */
export const serviceAccountResourceInfo = {
    kind: "ServiceAccount",
    deployedWhen: () => true as const,
    statusQuery: async (props: ResourcePropsWithConfig, observe: ObserveForStatus, buildData: BuildData) => {
        const obs: any = await observe(K8sObserver, gql`
            query ($name: String!, $kubeconfig: JSON!, $namespace: String!) {
                withKubeconfig(kubeconfig: $kubeconfig) {
                    readCoreV1NamespacedServiceAccount(name: $name, namespace: $namespace) @all(depth: 100)
                }
            }`,
            {
                name: resourceIdToName(props.key, buildData.id, buildData.deployID),
                kubeconfig: props.config.kubeconfig,
                namespace: computeNamespaceFromMetadata(props.metadata)
            }
        );
        return obs.withKubeconfig.readCoreV1NamespacedServiceAccount;
    },
    makeManifest: (manifest: Manifest, elem: AdaptElement<ResourceProps>, _deployID: string) => {
        const { automountServiceAccountToken, imagePullSecrets, secrets } = elem.props as ResourceServiceAccount;
        return {
            ...manifest,
            automountServiceAccountToken,
            imagePullSecrets,
            secrets,
        };
    }
};

registerResourceKind(serviceAccountResourceInfo);
