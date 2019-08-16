/*
 * Copyright 2018 Unbounded Systems, LLC
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

import * as ld from "lodash";
import { LifecycleInfo } from "./dom-parser";

export interface AnyProps {
    [key: string]: any;
}

export interface WithChildren {
    children?: any | any[];
}

export function isDOMNode(n: any): n is DOMNode {
    return n instanceof DOMNode;
}

export class DOMNode {
    parent: DOMNode | null = null;
    readonly props: AnyProps & WithChildren;

    constructor(
        readonly componentType: string,
        props: AnyProps,
        readonly lifecycleInfo: LifecycleInfo | undefined,
        readonly uri: string,
        children?: any[]
    ) {
        this.props = ld.clone(props);

        if (children != null) {
            if (children.length !== 0) {
                for (const child of children) {
                    if (isDOMNode(child)) {
                        child.parent = this;
                    }
                }
                this.props.children = (children.length === 1) ?
                    children[0] :
                    children;
            }
        }
    }
}

export class DOMObject {
    constructor(readonly uri: string, readonly data: any) {}
}

export function isDOMObject(n: unknown): n is DOMObject {
    return n instanceof DOMObject;
}
