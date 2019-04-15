import {
    FinalDomElement,
    isFinalDomElement,
    PrimitiveComponent,
} from "@usys/adapt";
import { AnsibleHost } from "./ansible_host";

export interface AnsibleGroupProps {
    ansibleHost: AnsibleHost;
    groups: string | string[];
    /*
    vars?: { [ key: string ]: any };
    file?: string;
    name?: string;
    environment?: { [ key: string ]: string };
    tasks?: any;
    timeout?: number; // seconds
    */
}

export function getGroups(props: AnsibleGroupProps): string[] {
    if (Array.isArray(props.groups)) return props.groups;
    return [props.groups];
}

export class AnsibleGroup extends PrimitiveComponent<AnsibleGroupProps> { }
export default AnsibleGroup;

export function isAnsibleGroupFinalElement(
    val: any): val is FinalDomElement<AnsibleGroupProps> {
    return isFinalDomElement(val) && val.componentType === AnsibleGroup;
}
