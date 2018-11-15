import {
    AdaptPrimitiveElement,
    isPrimitiveElement,
    PrimitiveComponent
} from "@usys/adapt";

export interface AnyProperties {
    [ propName: string ]: any;
}

export interface CFResourceProps {
    Type: string;
    Properties: AnyProperties;
    children?: any;
}

export class CFResource extends PrimitiveComponent<CFResourceProps> {

}

export function isCFResourceElement(val: any): val is AdaptPrimitiveElement<CFResourceProps> {
    return isPrimitiveElement(val) && val.componentType === CFResource;
}
