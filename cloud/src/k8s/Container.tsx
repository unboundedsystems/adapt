import { PrimitiveComponent } from "@usys/adapt";

export interface ContainerProps {
    name: string; //Must be unique within pod
    image: string;
    args?: string[];
    command?: string;
    workingDir?: string;
}

function validateProps(_props: ContainerProps) {
    //throw if we don't like props
    //FIXME(manishv) check if name is legal in k8s
    //FIXME(manishv) check if image string is valid URL
    //FIXME(manishv) check if workDir is valid path
}

export class Container extends PrimitiveComponent<ContainerProps> {
    constructor(props: ContainerProps) {
        validateProps(props);
        super(props);
    }
}
