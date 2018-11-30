import {
    AdaptPrimitiveElement,
    isPrimitiveElement,
    PrimitiveComponent,
} from "@usys/adapt";

export interface AnsiblePlaybookProps {
    playbookFile: string;
    vars?: { [ key: string ]: any };
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
