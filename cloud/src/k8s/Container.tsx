import { AdaptElement, PrimitiveComponent } from "@usys/adapt";
import * as ctr from "../Container";

export interface K8sContainerProps {
    name: string; //Must be unique within pod
    image: string;

    args?: string[];
    command?: string[];
    tty?: boolean;
    workingDir?: string;
}

export function k8sContainerProps(abstractProps: ctr.ContainerProps): K8sContainerProps {
    const { command, entrypoint, tty, workingDir } = abstractProps;

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
