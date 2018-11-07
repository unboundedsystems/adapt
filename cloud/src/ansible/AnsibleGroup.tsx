import {
    AdaptPrimitiveElement,
    isPrimitiveElement,
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

export function isAnsibleGroupElement(
    val: any): val is AdaptPrimitiveElement<AnsibleGroupProps> {
    return isPrimitiveElement(val) && val.componentType === AnsibleGroup;
}
