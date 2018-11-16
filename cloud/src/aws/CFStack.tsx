import aws = require("aws-sdk");

import Adapt, {
    AdaptPrimitiveElement,
    childrenToArray,
    Component,
    isElement,
    isPrimitiveElement,
    PrimitiveComponent,
    WithChildren,
} from "@usys/adapt";
import { OverwriteT } from "type-ops";
import {
    getResourceIds,
    resourceIdList,
    ResourceIdPolicy,
    ResourceIdProps,
    ResourceIdState,
    updateResourceIdState
} from "../resource_id";
import { withCredentials, WithCredentials } from "./credentials";

const resourceIds = resourceIdList("StackName");

export type CFStackPrimitiveProps =
    aws.CloudFormation.CreateStackInput &
    WithChildren &
    WithCredentials;

export class CFStackPrimitive extends PrimitiveComponent<CFStackPrimitiveProps> {
    validate() {
        try {
            this.validateChildren(this.props.children);
        } catch (err) {
            if (err instanceof Error && err.message === "Stack within stack") {
                return "Nested CFStacks are not currently supported";
            }
        }
        return;
    }

    // FIXME(mark): This *should* happen during DOM validation, but the
    // time complexity of this sucks. A more efficient check would be to
    // traverse parents to the root, looking for a CFStackPrimitive, but we
    // don't currently have parent info in validate.
    validateChildren(children: any) {
        for (const k of childrenToArray(children)) {
            if (isCFStackPrimitiveElement(k)) throw new Error(`Stack within stack`);
            if (isElement<WithChildren>(k)) this.validateChildren(k.props.children);
        }
    }
}

// Input props for CFStack allow passing a ResourceId to props.StackName
export type CFStackProps =
    OverwriteT<CFStackPrimitiveProps, ResourceIdProps<typeof resourceIds>>;

export interface CFStackState extends ResourceIdState<typeof resourceIds> {
}

export class CFStackBase extends Component<CFStackProps, CFStackState> {

    constructor(props: CFStackProps) {
        super(props);
        this.setState((prev) =>
            updateResourceIdState(resourceIds, props, prev,
                                  ResourceIdPolicy.local, { separator: "-" })
        );
    }

    initialState() { return {}; }

    build() {
        const ids = getResourceIds(resourceIds, this.state);
        if (ids == null) return null; // Haven't completed first state update

        // Make sure StackName (and any other ResourceIds are just strings
        // in the primitive component)
        const { handle, ...primProps } = { ...this.props, ...ids };
        return <CFStackPrimitive {...primProps} />;
    }
}

export function isCFStackPrimitiveElement(val: any): val is AdaptPrimitiveElement<CFStackPrimitiveProps> {
    return isPrimitiveElement(val) && val.componentType === CFStackPrimitive;
}

// tslint:disable-next-line:variable-name
export const CFStack = withCredentials(CFStackBase);
