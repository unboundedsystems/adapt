import {
    AdaptPrimitiveElement,
    isPrimitiveElement,
    PrimitiveComponent,
} from "@usys/adapt";

export interface Vars {
    [ key: string ]: any;
}

export interface Common {
    remote_user?: string;
    become?: string;
    become_method?: string;
    [ key: string ]: any;
}

export interface Play extends Common {
    hosts: string;
    tasks: Task[];
    vars?: Vars;
    handlers?: Handler[];
    order?: string;
}

export interface Task extends Common {
    name: string;
    notify?: string[];
}

export interface Handler {
    name: string;
    [ key: string ]: any;
}

export interface AnsiblePlaybookProps {
    // One of playbookFile or playbookPlays must be specified
    playbookFile?: string;
    playbookPlays?: Play[];

    vars?: Vars;
    /*
    name?: string;
    roles?: string[];
    environment?: { [ key: string ]: string };
    tasks?: any;
    timeout?: number; // seconds
    */
}

export class AnsiblePlaybook extends PrimitiveComponent<AnsiblePlaybookProps> { }
export default AnsiblePlaybook;

export function isAnsiblePlaybookElement(
    val: any): val is AdaptPrimitiveElement<AnsiblePlaybookProps> {
    return isPrimitiveElement(val) && val.componentType === AnsiblePlaybook;
}

export class AnsibleImplicitPlaybook extends AnsiblePlaybook { }

export function isAnsibleImplicitPlaybookElement(
    val: any): val is AdaptPrimitiveElement<AnsiblePlaybookProps> {
    return isPrimitiveElement(val) && val.componentType === AnsibleImplicitPlaybook;
}
