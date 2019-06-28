import {
    FinalDomElement,
    isFinalDomElement,
    PrimitiveComponent,
} from "@adpt/core";
import { AnsibleHost } from "./ansible_host";
import { Vars } from "./common";

export interface AnsibleRoleProps {
    ansibleHost?: AnsibleHost;
    galaxy?: string;
    vars?: Vars;
}

export function roleName(props: AnsibleRoleProps): string | undefined {
    return props.galaxy;
}

export class AnsibleRole extends PrimitiveComponent<AnsibleRoleProps> { }
export default AnsibleRole;

export function isAnsibleRoleFinalElement(
    val: any): val is FinalDomElement<AnsibleRoleProps> {
    return isFinalDomElement(val) && val.componentType === AnsibleRole;
}
