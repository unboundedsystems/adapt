import {
    AdaptPrimitiveElement,
    isPrimitiveElement,
    PrimitiveComponent,
} from "@usys/adapt";
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

export function isAnsibleRoleElement(
    val: any): val is AdaptPrimitiveElement<AnsibleRoleProps> {
    return isPrimitiveElement(val) && val.componentType === AnsibleRole;
}
