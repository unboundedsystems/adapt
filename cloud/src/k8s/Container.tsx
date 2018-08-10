import { AdaptElement, PrimitiveComponent } from "@usys/adapt";
import * as ctr from "../Container";

export interface ContainerProps {
    name: string; //Must be unique within pod
    image: string;

    args?: string[];
    command?: string[];
    tty?: boolean;
    workingDir?: string;
}

export function k8sContainerProps(abstractProps: ctr.ContainerProps): ContainerProps {
    const { command, entrypoint, tty, workingDir } = abstractProps;

    const ret: ContainerProps = {
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

function validateProps(_props: ContainerProps) {
    //throw if we don't like props
    //FIXME(manishv) check if name is legal in k8s
    //FIXME(manishv) check if image string is valid URL
    //FIXME(manishv) check if workDir is valid path
}

export function isContainerElement(x: AdaptElement): x is AdaptElement<ContainerProps> {
    return x.componentType === Container;
}

export class Container extends PrimitiveComponent<ContainerProps> {
    constructor(props: ContainerProps) {
        super(props);
        validateProps(props);
    }
}
