import { PrimitiveComponent } from "@usys/adapt";
import * as abs from "../NetworkService";

// FIXME(mark): Remove comment when working
// CLI that exposes a port
// kubectl expose pod fixme-manishv-nodecellar.nodecellar-compute.nodecellar-compute0 --port 8080 --target-port 8080 --name nodecellar

export interface ServiceProps {
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

export function k8sServiceProps(abstractProps: abs.NetworkServiceProps): ServiceProps {
    if (typeof abstractProps.port !== "number") throw new Error(`Service: Port string not yet implemented`);
    if (abstractProps.ip != null) throw new Error(`Service: IP not yet implemented`);
    if (abstractProps.name != null) throw new Error(`Service: name not yet implemented`);

    const port: ServicePort = {
        // FIXME(mark): Should NetworkService expose two different ports?
        port: abstractProps.port,
        targetPort: abstractProps.port,
    };
    if (abstractProps.protocol != null) port.protocol = abstractProps.protocol;

    const ret: ServiceProps = {
        ports: [port],
    };

    return ret;
}

export class Service extends PrimitiveComponent<ServiceProps> {
}
