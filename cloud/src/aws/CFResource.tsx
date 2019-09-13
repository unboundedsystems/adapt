/*
 * Copyright 2018-2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Adapt, {
    DeployedWhenMethod,
    FinalDomElement,
    Handle,
    isFinalDomElement,
    PrimitiveComponent,
    SFCDeclProps,
    useContext,
    waiting
} from "@adpt/core";
import { CFStackContext } from "./stack_context";

/** @beta */
export interface AnyProperties {
    [ propName: string ]: any;
}

/** @beta */
export interface CFResourceProps {
    Type: string;
    Properties: AnyProperties;
    cfStackHandle?: Handle;
    children?: any;
    /**
     * Set to true if CloudFormation or the underlying AWS resource does not
     * support tagging
     */
    tagsUnsupported?: boolean;
}

/** @beta */
export class CFResourcePrimitive extends PrimitiveComponent<CFResourceProps> {
    deployedWhen: DeployedWhenMethod = async (goalStatus, helpers) => {
        const hand = this.props.cfStackHandle;
        if (!hand) {
            throw new Error(`CFResource must have a valid Handle ` +
                `to its corresponding CFStack in props.cfStackHandle`);
        }
        if (!hand.target) {
            throw new Error(`CFResource props.cfStackHandle does not ` +
                `reference a valid Element`);
        }
        if (helpers.isDeployed(hand)) return true;
        return waiting(`Waiting for CFStack to be ${goalStatus.toLowerCase()}`);
    }
}

/** @beta */
export function isCFResourcePrimitiveElement(val: any): val is FinalDomElement<CFResourceProps> {
    return isFinalDomElement(val) && val.componentType === CFResourcePrimitive;
}

/** @beta */
export function CFResource(props: SFCDeclProps<CFResourceProps>) {
    const { handle: _h, cfStackHandle, ...rest } = props;
    // Always call hook
    let stackHand = useContext(CFStackContext);
    if (cfStackHandle) stackHand = cfStackHandle;
    return <CFResourcePrimitive cfStackHandle={stackHand} {...rest} />;
}
