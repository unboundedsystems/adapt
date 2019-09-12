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
import { Env, Vars } from "./common";

/** @alpha */
export interface Common {
    become?: string;
    become_method?: string;
    name?: string;
    vars?: Vars;

    [ key: string ]: any;
}

/** @alpha */
export interface Role extends Common {
}

/** @alpha */
export interface Play extends Common {
    hosts: string;

    environment?: Env;
    handlers?: Handler[];
    ignore_errors?: boolean;
    ignore_unreachable?: boolean;
    order?: string;
    remote_user?: string;
    roles?: Role[] | string[];
    tasks?: Task[];
}

/** @alpha */
export interface Task extends Common {
    notify?: string[];
}

/** @alpha */
export interface Handler {
    name: string;
    [ key: string ]: any;
}

/** @alpha */
export interface AnsiblePlaybookProps {
    // One of playbookFile or playbookPlays must be specified
    playbookFile?: string;
    playbookPlays?: Play[];

    vars?: Vars;
}

/** @alpha */
export class AnsiblePlaybook extends PrimitiveComponent<AnsiblePlaybookProps> { }
export default AnsiblePlaybook;

/** @alpha */
export function isAnsiblePlaybookFinalElement(
    val: any): val is FinalDomElement<AnsiblePlaybookProps> {
    return isFinalDomElement(val) && val.componentType === AnsiblePlaybook;
}

/** @alpha */
export class AnsibleImplicitPlaybook extends AnsiblePlaybook { }

/** @alpha */
export function isAnsibleImplicitPlaybookFinalElement(
    val: any): val is FinalDomElement<AnsiblePlaybookProps> {
    return isFinalDomElement(val) && val.componentType === AnsibleImplicitPlaybook;
}
