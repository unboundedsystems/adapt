import { AdaptElement, PrimitiveComponent } from "@usys/adapt";
import * as ctr from "../Container";

export interface ContainerSpec {
    name: string; //Must be unique within pod
    image: string;

    args?: string[];
    command?: string[];
    env?: EnvVar[];
    tty?: boolean;
    ports?: ContainerPort[];
    workingDir?: string;
}

export interface K8sContainerProps extends ContainerSpec {}

export interface ContainerPort {
    // Number of port to expose on the pod's IP address. This must be a
    // valid integer port number, 0 < x < 65536.
    containerPort: number;
    // What host IP to bind the external port to.
    hostIP?: string;
    // Number of port to expose on the host. If specified, this must be a
    // valid integer port number, 0 < x < 65536. If HostNetwork is specified,
    // this must match ContainerPort. Most containers do not need this.
    hostPort?: number;
    // If specified, this must be an IANA_SVC_NAME and unique within the pod.
    // Each named port in a pod must have a unique name. Name for the port
    // that can be referred to by services.
    name?: string;
    // Protocol for port. Must be UDP or TCP. Defaults to "TCP".
    protocol?: string;
}

export interface EnvVar {
    // Name of the environment variable. Must be a C_IDENTIFIER.
    name: string;
    // Variable references $(VAR_NAME) are expanded using the previous defined
    // environment variables in the container and any service environment
    // variables. If a variable cannot be resolved, the reference in the input
    // string will be unchanged. The $(VAR_NAME) syntax can be escaped with a
    // double $$, ie: $$(VAR_NAME). Escaped references will never be expanded,
    // regardless of whether the variable exists or not. Defaults to "".
    value: string;
    // Source for the environment variable's value. Cannot be used if value is
    // not empty.
    //valueFrom?: EnvVarSource; // NOTE(mark): Not implemented yet.
}

export function k8sContainerProps(abstractProps: ctr.ContainerProps): K8sContainerProps {
    const { command, entrypoint, environment, ports, tty, workingDir } = abstractProps;

    const ret: K8sContainerProps = {
        name: abstractProps.name,
        image: abstractProps.image,
    };

    if (entrypoint != null) {
        ret.args = Array.isArray(entrypoint) ? entrypoint : [ entrypoint ];
    }
    if (command != null) {
        ret.command = Array.isArray(command) ? command : [ command ];
    }
    if (environment != null) {
        ret.env = Object.keys(environment).map((name) => {
            return {
                name,
                value: environment[name],
            };
        });
    }
    if (ports != null) {
        ret.ports = ports.map((desc) => {
            if (typeof desc === "string") {
                throw new Error(`String port description not implemented`);
            }
            return {
                containerPort: desc,
            };
        });
    }
    if (tty != null) ret.tty = tty;
    if (workingDir != null) ret.workingDir = workingDir;

    return ret;
}

export function isContainerElement(x: AdaptElement): x is AdaptElement<K8sContainerProps> {
    return x.componentType === K8sContainer;
}

export class K8sContainer extends PrimitiveComponent<K8sContainerProps> {
    /*
    validate() {
        //FIXME(manishv) check if name is legal in k8s
        //FIXME(manishv) check if image string is valid URL
        //FIXME(manishv) check if workDir is valid path
    }
    */
}
