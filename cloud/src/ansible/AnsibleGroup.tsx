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

import {
    FinalDomElement,
    isFinalDomElement,
    PrimitiveComponent,
} from "@adpt/core";
import { AnsibleHost } from "./ansible_host";

/** @alpha */
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

/** @beta */
export function getGroups(props: AnsibleGroupProps): string[] {
    if (Array.isArray(props.groups)) return props.groups;
    return [props.groups];
}

/** @alpha */
export class AnsibleGroup extends PrimitiveComponent<AnsibleGroupProps> { }
export default AnsibleGroup;

/** @alpha */
export function isAnsibleGroupFinalElement(
    val: any): val is FinalDomElement<AnsibleGroupProps> {
    return isFinalDomElement(val) && val.componentType === AnsibleGroup;
}
