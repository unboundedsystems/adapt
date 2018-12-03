import {
    AdaptPrimitiveElement,
    isPrimitiveElement,
    PrimitiveComponent,
} from "@usys/adapt";
import { Env, Vars } from "./common";

export interface Common {
    become?: string;
    become_method?: string;
    name?: string;
    vars?: Vars;

    [ key: string ]: any;
}

export interface Role extends Common {
}

export interface Play extends Common {
    hosts: string;

    environment?: Env;
    handlers?: Handler[];
    ignore_errors?: boolean;
    ignore_unreachable?: boolean;
    order?: string;
    remote_user?: string;
    roles?: Role[] | string[];
    tasks?: Task[];
}

export interface Task extends Common {
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
