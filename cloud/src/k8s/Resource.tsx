import Adapt, {
    AdaptElement,
    BuildData,
    childrenToArray,
    noStatusOnError,
    ObserveForStatus,
    PrimitiveComponent
} from "@usys/adapt";
import * as ld from "lodash";

import { ResourceProps } from "./common";
import { getResourceInfo } from "./k8s_plugin";

export function isResourceElement(e: AdaptElement): e is AdaptElement<ResourceProps & Adapt.BuiltinProps> {
    return e.componentType === Resource;
}

export class Resource extends PrimitiveComponent<ResourceProps> {
    constructor(props: ResourceProps) {
        super(props);
    }

    validate() {
        const children = childrenToArray((this.props as any).children);

        if (!ld.isEmpty(children)) return "Resource elements cannot have children";

        //Do other validations of Specs here
    }

    async status(observe: ObserveForStatus, buildData: BuildData) {
        const info = getResourceInfo(this.props.kind);
        if (!info) return undefined;

        const statusQuery = info.statusQuery;
        if (!statusQuery) return { noStatus: "no status query defined for this kind" };
        return noStatusOnError(() => statusQuery(this.props, observe, buildData));
    }
}
