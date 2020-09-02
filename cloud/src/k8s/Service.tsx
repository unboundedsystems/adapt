/*
 * Copyright 2018-2020 Unbounded Systems, LLC
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

// This is to deal with the long URLs in doc comments.
// tslint:disable: max-line-length

import Adapt, {
    AnyProps,
    BuildData,
    BuiltinProps,
    gql,
    Handle,
    isHandle,
    isMountedElement,
    ObserveForStatus,
    SFCBuildProps,
    SFCDeclProps,
    useBuildHelpers,
    useDeployedWhen,
    useImperativeMethods,
    useState,
    waiting,
    Waiting
} from "@adpt/core";
import { Omit, removeUndef } from "@adpt/utils";
import { isObject } from "lodash";
import {
    NetworkScope,
    NetworkServiceInstance,
    NetworkServiceProps,
    NetworkServiceScope,
    targetPort
} from "../NetworkService";
import { ClusterInfo, computeNamespaceFromMetadata, ResourceBase, ResourceProps, ResourceService } from "./common";
import { K8sObserver } from "./k8s_observer";
import { labelKey, registerResourceKind, resourceElementToName, resourceIdToName } from "./manifest_support";
import { Resource } from "./Resource";

/** @public */
export interface ServiceProps extends ServiceSpec {
    /** Legal configuration loaded from kubeconfig */
    config: ClusterInfo;
    selector?: Handle | EndpointSelector;
}

/** @public */
export interface ServiceSpec {
    /**
     * Cluster IP for a {@link k8s.Service}
     *
     * @remarks
     * `clusterIP` is the IP address of the service and is usually assigned
     * randomly by the master. If an address is specified manually and is not
     * in use by others, it will be allocated to the service; otherwise,
     * creation of the service will fail. This field can not be changed through
     * updates. Valid values are "None", empty string (""), or a valid IP
     * address. "None" can be specified for headless services when proxying is
     * not required. Only applies to types ClusterIP, NodePort, and
     * LoadBalancer. Ignored if type is ExternalName.
     *
     * For more information, see the
     * {@link https://kubernetes.io/docs/concepts/services-networking/service/#virtual-ips-and-service-proxies |
     * Kubernetes documentation}.
     */
    clusterIP?: string;
    /**
     * A list of IP addresses for which nodes in the cluster
     * will also accept traffic for this service.
     *
     * @remarks
     * These IPs are not managed by
     * Kubernetes. The user is responsible for ensuring that traffic arrives at
     * a node with this IP. A common example is external load balancers that are
     * not part of the Kubernetes system.
     */
    externalIPs?: string[];
    /**
     * The external reference that kubedns or equivalent
     * will return as a CNAME record for this service.
     *
     * @remarks
     * No proxying will be involved. Must be a
     * {@link https://tools.ietf.org/html/rfc1123 | valid RFC-1123 hostname}
     * and requires Type to be ExternalName.
     */
    externalName?: string;
    /**
     * Denotes if this Service desires to route
     * external traffic to node-local or cluster-wide endpoints.
     *
     * @remarks
     * "Local" preserves the client source IP and avoids a second hop for
     * LoadBalancer and Nodeport type services, but risks potentially
     * imbalanced traffic spreading. "Cluster" obscures the client source IP
     * and may cause a second hop to another node, but should have good overall
     * load-spreading.
     */
    externalTrafficPolicy?: string;
    /**
     * Specifies the healthcheck nodePort for the service.
     *
     * @remarks
     * If not specified, HealthCheckNodePort is created by the service
     * api backend with the allocated nodePort. Will use user-specified nodePort
     * value if specified by the client. Only affects when Type is set to
     * LoadBalancer and ExternalTrafficPolicy is set to Local.
     */
    healthCheckNodePort?: number;
    /**
     * Only applies to Service Type: LoadBalancer. LoadBalancer will
     * get created with the IP specified in this field.
     *
     * @remarks
     * This feature depends on
     * whether the underlying cloud provider supports specifying the loadBalancerIP
     * when a load balancer is created. This field will be ignored if the
     * cloud provider does not support the feature.
     */
    loadBalancerIP?: string;
    /**
     * If specified and supported by the platform, this will
     * restrict traffic through the cloud provider load balancer
     * to the specified client IPs.
     *
     * @remarks
     * This field will be ignored if the cloud provider
     * does not support the feature.
     *
     * For more information, see the
     * {@link https://v1-16.docs.kubernetes.io/docs/tasks/access-application-cluster/configure-cloud-provider-firewall/ |
     * Kubernetes documentation}.
     */
    loadBalancerSourceRanges?: string[];
    /**
     * The list of ports that are exposed by this service.
     *
     * @remarks
     * For more information, see the
     * {@link https://kubernetes.io/docs/concepts/services-networking/service/#virtual-ips-and-service-proxies |
     * Kubernetes documentation}.
     */
    ports?: ServicePort[];
    /**
     * When set to true, indicates that
     * DNS implementations must publish the notReadyAddresses of subsets for the
     * Endpoints associated with the Service.
     *
     * @remarks
     * The default value is false. The
     * primary use case for setting this field is to use a StatefulSet's Headless
     * Service to propagate SRV records for its Pods without respect to their
     * readiness for purpose of peer discovery.
     */
    publishNotReadyAddresses?: boolean;
    /**
     * Route service traffic to pods with label keys and values
     * matching this selector.
     *
     * @remarks
     * If empty or not present, the service is assumed to
     * have an external process managing its endpoints, which Kubernetes will not
     * modify. Only applies to types ClusterIP, NodePort, and LoadBalancer.
     * Ignored if type is ExternalName.
     *
     * For more information, see the
     * {@link https://kubernetes.io/docs/concepts/services-networking/service/ |
     * Kubernetes documentation}.
     */
    selector?: EndpointSelector | object; //FIXME(manishv) object allows ServiceProps to expand type, need a better fix
    /**
     * Used to maintain session affinity.
     *
     * @remarks
     * Possible values are:
     *
     * - `"ClientIP"`: Enables client IP based session affinity.
     *
     * - `"None"`: Disables session affinity.
     *
     * For more information, see the
     * {@link https://kubernetes.io/docs/concepts/services-networking/service/#virtual-ips-and-service-proxies |
     * Kubernetes documentation}.
     * @defaultValue `"None"`
     */
    sessionAffinity?: string;
    // sessionAffinityConfig contains the configurations of session affinity.
    //sessionAffinityConfig?: SessionAffinityConfig;
    /**
     * Determines how the Service is exposed.
     *
     * @remarks
     * Valid options are:
     *
     * - `"ExternalName"`: maps to the specified externalName.
     *
     * - `"ClusterIP"`: allocates a cluster-internal IP address for load
     * balancing to endpoints. Endpoints are determined by the selector or if
     * that is not specified, by manual construction of an Endpoints object. If
     * clusterIP is "None", no virtual IP is allocated and the endpoints are
     * published as a set of endpoints rather than a stable IP.
     *
     * - `"NodePort"`: Builds on ClusterIP and allocates a port on every node
     * which routes to the clusterIP.
     *
     * - `"LoadBalancer"`: Builds on NodePort and creates an external load
     * balancer (if supported in the current cloud) which routes to the
     * clusterIP.
     *
     * For more information, see the
     * {@link https://kubernetes.io/docs/concepts/services-networking/service/#publishing-services---service-types |
     * Kubernetes documentation}.
     * @defaultValue `"ClusterIP"`
     */
    type?: string;
}

/** @public */
export interface ServicePort {
    /**
     * The name of this port within the service.
     *
     * @remarks
     * This must be a DNS_LABEL.
     * All ports within a ServiceSpec must have unique names.This maps to the
     * Name' field in EndpointPort objects. Optional if only one ServicePort is
     * defined on this service.
     */
    name?: string;
    /**
     * The port on each node on which this service is exposed when
     * type=NodePort or LoadBalancer.
     *
     * @remarks
     * Usually assigned by the system. If
     * specified, it will be allocated to the service if unused or else creation
     * of the service will fail.
     *
     * For more information, see the
     * {@link https://kubernetes.io/docs/concepts/services-networking/service/#type-nodeport |
     * Kubernetes documentation}.
     * @defaultValue Automatically allocates a port if the ServiceType of this
     * Service requires one.
     */
    nodePort?: number;
    /** The port that will be exposed by this service. */
    port?: number;
    /** The IP protocol for this port.Supports "TCP" and "UDP".Default is TCP. */
    protocol?: string;
    /**
     * Number or name of the port to access on the pods targeted by the
     * service.
     *
     * @remarks
     * Number must be in the range 1 to 65535. Name must be an
     * IANA_SVC_NAME. If this is a string, it will be looked up as a named port
     * in the target Pod's container ports. If this is not specified, the value
     * of the 'port' field is used (an identity map). This field is ignored for
     * services with clusterIP = None, and should be omitted or set equal to the
     * 'port' field.
     *
     * For more information, see the
     * {@link https://kubernetes.io/docs/concepts/services-networking/service/#defining-a-service |
     * Kubernetes documentation}.
     */
    targetPort?: number | string;
}

function toServiceType(scope: NetworkServiceScope | undefined) {
    switch (scope) {
        case "cluster-internal":
        case undefined:
            return "ClusterIP";
        case "cluster-public":
            return "NodePort";
        case "external":
            return "LoadBalancer";
        default:
            throw new Error(`Service: NetworkService scope '${scope}' not mapped to a Kubernetes service type`);
    }
}

/**
 * Convert {@link NetworkService} props to {@link k8s.Service} props
 * @param abstractProps - props to convert
 * @returns Kubernetes spec corresponding to `abstractProps`
 *
 * @internal
 */
export function k8sServiceProps(abstractProps: NetworkServiceProps & BuiltinProps): Omit<ServiceProps, keyof ResourceBase> {
    if (typeof abstractProps.port !== "number") throw new Error(`Service: Port string not yet implemented`);
    if (abstractProps.ip != null) throw new Error(`Service: IP not yet implemented`);
    if (abstractProps.name != null) throw new Error(`Service: name not yet implemented`);

    const port: ServicePort = {
        port: abstractProps.port,
        targetPort: targetPort(abstractProps),
    };
    if (abstractProps.protocol != null) port.protocol = abstractProps.protocol;

    const ret: Omit<ServiceProps, keyof ResourceBase> & Partial<BuiltinProps> = {
        key: abstractProps.key,
        ports: [port],
        selector: abstractProps.endpoint,
        type: toServiceType(abstractProps.scope),
    };

    return ret;
}

interface EndpointSelector {
    [key: string]: string;
}

const defaultProps = {
    sessionAffinity: "None",
    type: "ClusterIP",
};

function findInArray<T extends { [key: string]: any }>(arr: T[] | undefined | null, keyProp: string, key: any) {
    if (!arr) return undefined;
    for (const item of arr) {
        if (item[keyProp] === key) return item;
    }
    return undefined;
}

interface NoExternalName {
    noName: true;
}
const noExternalName: NoExternalName = { noName: true };
function isNoExternalName(x: any): x is NoExternalName {
    return x === noExternalName;
}

async function getExternalName(props: SFCBuildProps<ServiceProps, typeof defaultProps>):
    Promise<string | NoExternalName | Waiting> {
    const log = console; //FIXME(manishv) Use proper logger here
    const resourceHand = props.handle;
    const resourceElem = resourceHand.target;
    if (!resourceElem) return noExternalName; //This should not be able to happen
    if (!isMountedElement(resourceElem)) return noExternalName; //Should not be possible

    //Don't fetch status if we don't need it
    if (!(props.type === "LoadBalancer" || props.type === "ExternalName")) return noExternalName;
    let statusTop: any;
    try {
        statusTop = await resourceElem.status<any>();
    } catch (e) {
        //Status not available yet
        if (e.message.startsWith("Resource not found")) return waiting("Waiting for resource to be created");
        throw e;
    }
    if (!statusTop) return waiting("Waiting for status from k8s");

    const spec = statusTop.spec;
    const status = statusTop.status;
    if (!status) return waiting("Waiting for status from k8s");
    if (spec.type === "LoadBalancer") {
        if (status.loadBalancer === undefined) return waiting("Waiting for loadBlancer status from k8s");
        const ingresses: string | string[] | undefined | null | unknown = status.loadBalancer.ingress;
        if (ingresses == null) return waiting("Waiting for Ingress IP");
        if (typeof ingresses === "string") return ingresses;
        if (Array.isArray(ingresses)) {
            if (ingresses.length === 0) return noExternalName;
            if (ingresses.length !== 1) log.warn(`Multiple k8s LoadBalancer ingresses returned, using only one: ${ingresses}`);
            for (const ingress of ingresses as { hostname: string | null; ip: string | null }[]) {
                if (ingress.hostname) return ingress.hostname;
                if (ingress.ip) return ingress.ip;
            }
        }

        return noExternalName;
    }

    if (spec.type === "ExternalName" && spec.externalName) return spec.externalName as string;

    return noExternalName;
}

/**
 * Native Kubernetes Service resource
 *
 * @remarks
 *
 * Implements the {@link NetworkServiceInstance} interface.
 *
 * @public
 */
export function Service(propsIn: SFCDeclProps<ServiceProps, typeof defaultProps>) {
    const props = propsIn as SFCBuildProps<ServiceProps, typeof defaultProps>;
    const helpers = useBuildHelpers();
    const deployID = helpers.deployID;

    if (props.ports && (props.ports.length > 1)) {
        for (const port of props.ports) {
            if (port.name === undefined) throw new Error("Service with multiple ports but no name on port");
        }
    }

    const [externalName, setExternalName] = useState<string | NoExternalName | undefined>(undefined);

    const [epSelector, updateSelector] = useState<EndpointSelector | undefined>(undefined);
    const manifest = makeSvcManifest(props, { endpointSelector: epSelector });
    useImperativeMethods<NetworkServiceInstance>(() => ({
        hostname: (scope?: NetworkScope) => {
            const resourceHand = props.handle;
            const resourceElem = resourceHand.target;
            if (!resourceElem) return undefined;
            if (scope && scope === NetworkScope.external) {
                if (isNoExternalName(externalName)) throw new Error("External name request for element, but no external name available");
                if (typeof externalName === "string") return externalName;
                return undefined;
            } else {
                const resourceName = resourceElementToName(resourceElem, deployID);
                const namespace = computeNamespaceFromMetadata(manifest.metadata);
                return `${resourceName}.${namespace}.svc.cluster.local.`;
            }
        },
        port: (name?: string) => {
            if (name) {
                const item = findInArray(props.ports, "name", name);
                if (!item) return undefined;
                return item.port;
            } else if (props.ports) {
                //Should it be an error to ask for ports without a name when there is more than one?
                return props.ports[0].port;
            } else {
                return undefined;
            }
        }
    }));

    useDeployedWhen(async () => {
        const statusName = await getExternalName(props);
        if ((typeof statusName === "string") || isNoExternalName(statusName)) {
            setExternalName(statusName);
            return true;
        }
        return statusName;
    });

    updateSelector(async () => {
        const { selector: ep } = props;
        if (!isHandle(ep)) return removeUndef(ep || {});
        if (!ep.target) return {};
        if (!isMountedElement(ep.target)) return {};

        if (ep.target.componentType !== Resource) {
            throw new Error(`Cannot handle k8s.Service endpoint of type ${ep.target.componentType.name}`);
        }
        const epProps: ResourceProps = ep.target.props as AnyProps as ResourceProps;
        if (epProps.kind !== "Pod") {
            throw new Error(`Cannot have k8s.Service endpoint of kind ${epProps.kind}`);
        }
        return removeUndef({
            [labelKey("name")]: resourceElementToName(ep.target, deployID)
        });
    });

    return (
        <Resource
            key={props.key}
            config={props.config}
            kind={manifest.kind}
            metadata={manifest.metadata}
            spec={manifest.spec}
        />);
}
// TODO: The "as any" is a workaround for an api-extractor bug. See issue #185.
(Service as any).defaultProps = defaultProps;
(Service as any).status = async (_props: ServiceProps & BuiltinProps,
    _observe: ObserveForStatus,
    buildData: BuildData) => {
    const succ = buildData.successor;
    if (!succ) return undefined;
    return succ.status();
};

interface MakeManifestOptions {
    endpointSelector?: EndpointSelector;
}

function makeSvcManifest(props: ServiceProps & Partial<BuiltinProps>, options: MakeManifestOptions): ResourceService {
    const { config, key, handle, ...spec } = props;

    // Explicit default for ports.protocol
    if (spec.ports) {
        for (const p of spec.ports) {
            if (p.protocol === undefined) p.protocol = "TCP";
        }
    }

    if (spec.type === "LoadBalancer") {
        if (spec.sessionAffinity === undefined) spec.sessionAffinity = "None";
        if (spec.externalTrafficPolicy === undefined) spec.externalTrafficPolicy = "Cluster";
    }

    return {
        kind: "Service",
        metadata: {},
        spec: { ...spec, selector: isHandle(spec.selector) ? options.endpointSelector : spec.selector },
        config,
    };
}

function deployedWhen(statusObj: unknown) {
    const status: any = statusObj;
    // There doesn't appear to be much actual status for a
    // service like there is for a Pod.
    if (status == null || !isObject(status.status)) {
        return waiting(`Kubernetes cluster returned invalid status for Service`);
    }
    return true;
}

/** @internal */
export const serviceResourceInfo = {
    kind: "Service",
    deployedWhen,
    statusQuery: async (props: ResourceProps, observe: ObserveForStatus, buildData: BuildData) => {
        const obs: any = await observe(K8sObserver, gql`
            query ($name: String!, $kubeconfig: JSON!, $namespace: String!) {
                withKubeconfig(kubeconfig: $kubeconfig) {
                    readCoreV1NamespacedService(name: $name, namespace: $namespace) @all(depth: 100)
                }
            }`,
            {
                name: resourceIdToName(props.key, buildData.id, buildData.deployID),
                kubeconfig: props.config.kubeconfig,
                namespace: computeNamespaceFromMetadata(props.metadata)
            }
        );
        return obs.withKubeconfig.readCoreV1NamespacedService;
    },
};

registerResourceKind(serviceResourceInfo);
