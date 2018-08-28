import {
    AdaptPrimitiveElement,
    isPrimitiveElement,
    PrimitiveComponent,
    WithChildren,
} from "@usys/adapt";
import * as aws from "aws-sdk";
import { withCredentials, WithCredentials } from "./credentials";

export interface CFStackProps extends
    aws.CloudFormation.CreateStackInput,
    WithChildren,
    WithCredentials { }

export class CFStackBase extends PrimitiveComponent<CFStackProps> {
}

export function isCFStackElement(val: any): val is AdaptPrimitiveElement<CFStackProps> {
    return isPrimitiveElement(val) && val.componentType === CFStackBase;
}

// tslint:disable-next-line:variable-name
export const CFStack = withCredentials(CFStackBase);
