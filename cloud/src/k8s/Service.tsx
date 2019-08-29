/*
 * Copyright 2018-2019 Unbounded Systems, LLC
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
    useImperativeMethods,
    useState,
    waiting
} from "@adpt/core";
import { removeUndef } from "@adpt/utils";
import stringify from "json-stable-stringify";
import { isEqual, isObject, pick } from "lodash";
import { NetworkServiceProps, NetworkServiceScope, targetPort } from "../NetworkService";
import { ClusterInfo, computeNamespaceFromMetadata, ResourceProps, ResourceService } from "./common";
import { K8sObserver } from "./k8s_observer";
import { registerResourceKind, resourceElementToName, resourceIdToName } from "./k8s_plugin";
import { Resource } from "./Resource";

// FIXME(mark): Remove comment when working
// CLI that exposes a port
// tslint:disable-next-line:max-line-length
// kubectl expose pod fixme-manishv-nodecellar.nodecellar-compute.nodecellar-compute0 --port 8080 --target-port 8080 --name nodecellar

export interface ServiceProps extends ServiceSpec {
    config: ClusterInfo; //Legal configuration loaded from kubeconfig
    selector?: Handle | object;
}

export interface ServiceSpec {
    // clusterIP is the IP address of the service and is usually assigned
    // randomly by the master. If an address is specified manually and is not
    // in use by others, it will be allocated to the service; otherwise,
    // creation of the service will fail. This field can not be changed through
    // updates. Valid values are "None", empty string (""), or a valid IP
    // address. "None" can be specified for headless services when proxying is
    // not required. Only applies to types ClusterIP, NodePort, and
    // LoadBalancer. Ignored if type is ExternalName. More info:
    // https://kubernetes.io/docs/concepts/services-networking/service/#virtual-ips-and-service-proxies
    clusterIP?: string;
    // externalIPs is a list of IP addresses for which nodes in the cluster
    // will also accept traffic for this service. These IPs are not managed by
    // Kubernetes. The user is responsible for ensuring that traffic arrives at
    // a node with this IP. A common example is external load-balancers that are
    // not part of the Kubernetes system.
    externalIPs?: string[];
    // externalName is the external reference that kubedns or equivalent
    // will return as a CNAME record for this service. No proxying will be
    // involved. Must be a valid RFC-1123 hostname
    // (https://tools.ietf.org/html/rfc1123) and requires Type to be ExternalName.
    externalName?: string;
    // externalTrafficPolicy denotes if this Service desires to route
    // external traffic to node-local or cluster-wide endpoints. "Local" preserves
    // the client source IP and avoids a second hop for LoadBalancer and Nodeport
    // type services, but risks potentially imbalanced traffic spreading. "Cluster"
    // obscures the client source IP and may cause a second hop to another node,
    // but should have good overall load-spreading.
    externalTrafficPolicy?: string;
    // healthCheckNodePort specifies the healthcheck nodePort for
    // the service. If not specified, HealthCheckNodePort is created by the service
    // api backend with the allocated nodePort. Will use user-specified nodePort
    // value if specified by the client. Only effects when Type is set to
    // LoadBalancer and ExternalTrafficPolicy is set to Local.
    healthCheckNodePort?: number;
    // Only applies to Service Type: LoadBalancer LoadBalancer will
    // get created with the IP specified in this field. This feature depends on
    // whether the underlying cloud-provider supports specifying the loadBalancerIP
    // when a load balancer is created. This field will be ignored if the
    // cloud-provider does not support the feature.
    loadBalancerIP?: string;
    // If specified and supported by the platform, this will
    // restrict traffic through the cloud-provider load-balancer will be restricted
    // to the specified client IPs. This field will be ignored if the cloud-provider
    // does not support the feature." More info:
    // https://kubernetes.io/docs/tasks/access-application-cluster/configure-cloud-provider-firewall/
    loadBalancerSourceRanges?: string[];
    // The list of ports that are exposed by this service. More info:
    // https://kubernetes.io/docs/concepts/services-networking/service/#virtual-ips-and-service-proxies
    // patch strategy: merge
    // patch merge key: port
    ports?: ServicePort[];
    // publishNotReadyAddresses, when set to true, indicates that
    // DNS implementations must publish the notReadyAddresses of subsets for the
    // Endpoints associated with the Service. The default value is false. The
    // primary use case for setting this field is to use a StatefulSet's Headless
    // Service to propagate SRV records for its Pods without respect to their
    // readiness for purpose of peer discovery.
    publishNotReadyAddresses?: boolean;
    // Route service traffic to pods with label keys and values
    // matching this selector. If empty or not present, the service is assumed to
    // have an external process managing its endpoints, which Kubernetes will not
    // modify. Only applies to types ClusterIP, NodePort, and LoadBalancer.
    // Ignored if type is ExternalName. More info:
    // https://kubernetes.io/docs/concepts/services-networking/service/
    selector?: object;
    // Supports "ClientIP" and "None". Used to maintain session
    // affinity. Enable client IP based session affinity. Must be ClientIP or
    // None. Defaults to None. More info:
    // https://kubernetes.io/docs/concepts/services-networking/service/#virtual-ips-and-service-proxies
    sessionAffinity?: string;
    // sessionAffinityConfig contains the configurations of session affinity.
    //sessionAffinityConfig?: SessionAffinityConfig;
    // type determines how the Service is exposed. Defaults to
    // ClusterIP. Valid options are ExternalName, ClusterIP, NodePort, and
    // LoadBalancer. "ExternalName" maps to the specified externalName.
    // "ClusterIP" allocates a cluster-internal IP address for load-balancing to
    // endpoints. Endpoints are determined by the selector or if that is not
    // specified, by manual construction of an Endpoints object. If clusterIP is
    // "None", no virtual IP is allocated and the endpoints are published as a
    // set of endpoints rather than a stable IP. "NodePort" builds on ClusterIP
    // and allocates a port on every node which routes to the clusterIP.
    // "LoadBalancer" builds on NodePort and creates an external load-balancer
    // (if supported in the current cloud) which routes to the clusterIP.
    // More info:
    // https://kubernetes.io/docs/concepts/services-networking/service/#publishing-services---service-types
    type?: string;
}

export interface ServicePort {
    // The name of this port within the service. This must be a DNS_LABEL.
    // All ports within a ServiceSpec must have unique names. This maps to the
    // Name' field in EndpointPort objects. Optional if only one ServicePort is
    // defined on this service.
    name?: string;
    // The port on each node on which this service is exposed when
    // type=NodePort or LoadBalancer. Usually assigned by the system. If
    // specified, it will be allocated to the service if unused or else creation
    // of the service will fail. Default is to auto-allocate a port if the
    // ServiceType of this Service requires one. More info:
    // https://kubernetes.io/docs/concepts/services-networking/service/#type-nodeport
    nodePort?: number;
    // The port that will be exposed by this service.
    port?: number;
    // The IP protocol for this port. Supports "TCP" and "UDP". Default is TCP.
    protocol?: string;
    // Number or name of the port to access on the pods targeted by the
    // service. Number must be in the range 1 to 65535. Name must be an
    // IANA_SVC_NAME. If this is a string, it will be looked up as a named port
    // in the target Pod's container ports. If this is not specified, the value
    // of the 'port' field is used (an identity map). This field is ignored for
    // services with clusterIP=None, and should be omitted or set equal to the
    // 'port' field. More info:
    // https://kubernetes.io/docs/concepts/services-networking/service/#defining-a-service
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

export function k8sServiceProps(abstractProps: NetworkServiceProps & BuiltinProps): ServiceSpec {
    if (typeof abstractProps.port !== "number") throw new Error(`Service: Port string not yet implemented`);
    if (abstractProps.ip != null) throw new Error(`Service: IP not yet implemented`);
    if (abstractProps.name != null) throw new Error(`Service: name not yet implemented`);

    const port: ServicePort = {
        port: abstractProps.port,
        targetPort: targetPort(abstractProps),
    };
    if (abstractProps.protocol != null) port.protocol = abstractProps.protocol;

    const ret: ServiceSpec & Partial<BuiltinProps> = {
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

export function Service(propsIn: SFCDeclProps<ServiceProps, typeof defaultProps>) {
    const props = propsIn as SFCBuildProps<ServiceProps, typeof defaultProps>;
    const helpers = useBuildHelpers();
    const deployID = helpers.deployID;

    if (props.ports && (props.ports.length > 1)) {
        for (const port of props.ports) {
            if (port.name === undefined) throw new Error("Service with multiple ports but no name on port");
        }
    }

    const [epSelector, updateSelector] = useState<EndpointSelector | undefined>(undefined);
    const manifest = makeSvcManifest(props, { endpointSelector: epSelector });
    useImperativeMethods(() => ({
        hostname: () => {
            const resourceHand = props.handle;
            const resourceElem = resourceHand.target;
            if (!resourceElem) return undefined;
            const resourceName = resourceElementToName(resourceElem, deployID);
            const namespace = computeNamespaceFromMetadata(manifest.metadata);
            return `${resourceName}.${namespace}.svc.cluster.local.`;
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

    updateSelector(async () => {
        const { selector: ep } = props;
        if (!isHandle(ep)) return {};
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
            adaptName: resourceElementToName(ep.target, deployID)
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
(Service as any).defaultProps = defaultProps;
(Service as any).status = async (_props: ServiceProps & BuiltinProps,
    _observe: ObserveForStatus,
    buildData: BuildData) => {
    const succ = buildData.successor;
    if (!succ) return undefined;
    return succ.status();
};

/*
 * Plugin info
 */
const knownServiceSpecPaths = [
    // FIXME(mark): Requires more complex compare logic
    //"clusterIP",

    "externalIPs",  // array
    "externalName",
    "externalTrafficPolicy",
    "healthCheckNodePort",
    "loadBalancerIP",
    "loadBalancerSourceRanges",  // array
    "ports",  // array
    "publishNotReadyAddresses",
    "selector", // object
    "sessionAffinity",
    //"sessionAffinityConfig", // object
    "type",
];

type ArrayKeys<T> = { [K in keyof T]: Required<T>[K] extends any[] ? K : never }[keyof T];
/**
 * Given an object, will sort any properties of that object that are arrays.
 * The sort of each array happens in-place, modifying the original arrays.
 * @param obj An object whose array properties will be sorted
 * @param keys  The specific property names to sort
 */
function sortArrays<T extends object>(obj: T, keys: ArrayKeys<T>[]): void {
    for (const k of keys) {
        const arr = obj[k];
        if (arr === undefined) continue;
        if (!Array.isArray(arr)) throw new Error(`Unable to sort non-array (key=${k})`);
        if (arr.length === 0) continue;
        if (typeof arr[0] === "string") arr.sort();
        else {
            arr.sort((a, b) => {
                a = stringify(a);
                b = stringify(b);
                return a === b ? 0 :
                    a < b ? -1 : 1;
            });
        }
    }
}

function canonicalize(spec: ServiceSpec, isActual = false): ServiceSpec {
    const s = pick(spec, knownServiceSpecPaths) as ServiceSpec;
    if (isActual && spec.type !== "NodePort" && s.ports !== undefined) {
        s.ports = s.ports.map((port) => {
            return removeUndef({ ...port, nodePort: undefined });
        });
    }
    sortArrays(s, [
        "externalIPs",
        "loadBalancerSourceRanges",
    ]);
    return removeUndef(s);
}

function sortPorts(ports: ServicePort[]): ServicePort[] {
    ports = [...ports];
    ports.sort((aP, bP) => {
        const a = aP.name;
        const b = bP.name;
        if (b === undefined) return -1;
        if (a === undefined) return 1;
        return a === b ? 0 : (a < b ? -1 : 1);
    });
    return ports;
}

function nodePortsEqual(actual: ServiceSpec, element: ServiceSpec) {
    if (actual.ports === undefined) return element.ports === undefined;
    if (element.ports === undefined) return false;
    if (actual.ports.length !== element.ports.length) return false;

    const actualPorts = sortPorts(actual.ports);
    const elementPorts = sortPorts(element.ports);

    if (!(actual.type === "NodePort" && element.type === "NodePort")) {
        return isEqual(actualPorts, elementPorts);
    }

    // tslint:disable-next-line:prefer-for-of
    for (let i = 0; i < actualPorts.length; i++) {
        const aport = { ...actualPorts[i] };
        const eport = { ...elementPorts[i] };
        if (isEqual(aport, eport)) continue;
        if (eport.nodePort !== undefined) return false;
        delete aport.nodePort;
        delete eport.nodePort;
        if (!isEqual(aport, eport)) return false;
    }

    return true;
}

function serviceSpecsEqual(actual: ServiceSpec, element: ServiceSpec) {
    actual = canonicalize(actual, true);
    element = canonicalize(element);

    const actualPorts = actual.ports;
    const elementPorts = element.ports;
    delete actual.ports;
    delete element.ports;
    const equalWithoutPorts = isEqual(actual, element);
    if (!equalWithoutPorts) return false;

    actual.ports = actualPorts;
    element.ports = elementPorts;
    return nodePortsEqual(actual, element);
}

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

export const serviceResourceInfo = {
    kind: "Service",
    apiName: "services",
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
    specsEqual: serviceSpecsEqual,
};

registerResourceKind(serviceResourceInfo);
