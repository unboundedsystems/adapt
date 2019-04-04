import {
    BuiltDomElement,
    isBuiltDomElement,
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

export function isAnsibleRoleBuiltElement(
    val: any): val is BuiltDomElement<AnsibleRoleProps> {
    return isBuiltDomElement(val) && val.componentType === AnsibleRole;
}
