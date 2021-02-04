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

import Adapt, {
    AdaptElement,
    AdaptMountedElement,
    AnyProps,
    BuildData,
    gql,
    Handle,
    isHandle,
    isMountedElement,
    ObserveForStatus,
    SFCBuildProps,
    SFCDeclProps,
    useBuildHelpers,
    useState
} from "@adpt/core";
import { notNull, removeUndef } from "@adpt/utils";
import * as ld from "lodash";
import { isClusterRoleProps } from "./ClusterRole";
import {
    ClusterInfo,
    Metadata,
    ResourceClusterRoleBinding,
    ResourceProps,
    ResourcePropsWithConfig,
    RoleRef,
    Subject,
} from "./common";
import { K8sObserver } from "./k8s_observer";
import { Manifest, registerResourceKind, resourceElementToName, resourceIdToName } from "./manifest_support";
import { Resource } from "./Resource";
import { isServiceAccountProps } from "./ServiceAccount";

/**
 * Props for the {@link k8s.ServiceAccount} resource
 *
 * @public
 */
interface ClusterRoleBindingProps {
     /** Information about the k8s cluster (ip address, auth info, etc.) */
    config: ClusterInfo;

    /** k8s metadata */
    metadata: Metadata;
    roleRef: RoleRef | Handle;
    subjects: (Subject | Handle)[];
}

const defaultProps = {
    metadata: {}
};

function isNotReady<ValT, NotReadyT>(x: ValT | NotReadyT, nr: NotReadyT): x is NotReadyT {
    return ld.isEqual(x, nr);
}

function useResources<ValT, NotReadyT>({
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

function useResource<ValT, NotReadyT>(opts: {
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

/**
 * k8s ClusterRoleBinding resource
 *
 * @param propsIn - props for ServiceAccount as specifed in {@link k8s.ClusterRoleBindingProps}
 *
 * @public
 */
export function ClusterRoleBinding(propsIn: SFCDeclProps<ClusterRoleBindingProps, typeof defaultProps>) {
    const {
        key,
        config,
        metadata,
        roleRef: roleRefIn,
        subjects: subjectsIn,
    } = propsIn as SFCBuildProps<ClusterRoleBindingProps, typeof defaultProps>;
    const { deployID } = useBuildHelpers();

    const [roleRef, updateRoleRef] = useResource<RoleRef, null>({
        initial: null,
        notReady: null,
        kinds: ["ClusterRole"],
        thisResourceName: "ClusterRole",
        propName: "roleRef",
    });
    const [subjects, updateSubjects] = useResources<Subject, undefined>({
        initial: [],
        notReady: undefined,
        kinds: ["ServiceAccount"],
        thisResourceName: "ClusterRole",
        propName: "subjects",
    });

    updateRoleRef(roleRefIn, (e, roleRefProps) => {
        if (isClusterRoleProps(roleRefProps)) {
            return removeUndef({
                apiGroup: (roleRefProps.apiVersion && roleRefProps.apiVersion.split("/")[0]),
                kind: roleRefProps.kind,
                name: resourceElementToName(e, deployID),
            });
        }
        throw new Error(`Cannot have k8s.ClusterRoleBinding with roleRef of kind ${roleRefProps.kind}, is not a ClusterRole.`);
    });

    updateSubjects(subjectsIn, async (e, subjectProps) => {
        if (isServiceAccountProps(subjectProps)) {
            return removeUndef({
                apiGroup: (subjectProps.apiVersion && subjectProps.apiVersion.split("/")[0]) || "",
                kind: subjectProps.kind,
                name: resourceElementToName(e, deployID),
                namespace: subjectProps.metadata?.namespace || "default",
            });
        }
        throw new Error(`Cannot have k8s.ClusterRoleBinding with subject of kind ${subjectProps.kind}, is not a ClusterRole.`);
    });

    if (roleRef === null) return null;
    return <Resource
        key={key}
        apiVersion="rbac.authorization.k8s.io/v1"
        kind="ClusterRoleBinding"
        config={config}
        metadata={metadata}
        roleRef={roleRef}
        subjects={subjects.filter(notNull)}
    />;
}
// TODO: The "as any" is a workaround for an api-extractor bug. See issue #185.
(ClusterRoleBinding as any).defaultProps = defaultProps;

/** @internal */
export const clusterRoleBindingResourceInfo = {
    kind: "ClusterRoleBinding",
    deployedWhen: () => true as const,
    statusQuery: async (props: ResourcePropsWithConfig, observe: ObserveForStatus, buildData: BuildData) => {
        const obs: any = await observe(K8sObserver, gql`
            query ($name: String!, $kubeconfig: JSON!, $namespace: String!) {
                withKubeconfig(kubeconfig: $kubeconfig) {
                    readRbacAuthorizationV1ClusterRoleBinding(name: $name, namespace: $namespace) @all(depth: 100)
                }
            }`,
            {
                name: resourceIdToName(props.key, buildData.id, buildData.deployID),
                kubeconfig: props.config.kubeconfig,
            }
        );
        return obs.withKubeconfig.readRbacAuthorizationV1ClusterRoleBinding;
    },
    makeManifest: (manifest: Manifest, elem: AdaptElement<ResourceProps>, _deployID: string) => {
        const { roleRef, subjects } = elem.props as ResourceClusterRoleBinding;
        return {
            ...manifest,
            roleRef,
            subjects
        };
    }
};

registerResourceKind(clusterRoleBindingResourceInfo);
