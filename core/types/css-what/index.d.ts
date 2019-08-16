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

declare module "css-what" {

import { FlowArrayMutation } from "typescript";

namespace parser {
    export interface ParserOptions {
        xmlMode: boolean;
    }

    export interface Tag {
        type: 'tag';
        name: string;
    }

    export interface Universal {
        type: 'universal';
    }

    export interface Pseudo {
        type: 'pseudo';
        name: string;
        data?: ParsedSelector;
    }

    export interface Attribute {
        type: 'attribute';
        name: string;
        action: "exists" | "equals" | "element" | "start" | "end" | "any" | "not" | "hypen";
        value: string;
        ignoreCase: boolean;
    }

    export interface Descendant {
        type: 'descendant';
    }

    export interface Child {
        type: 'child';
    }

    export type ParsedSelectorFrag =
        | Tag
        | Universal
        | Pseudo
        | Attribute
        | Descendant
        | Child;
        
    export type ParsedSelectorBlock = ParsedSelectorFrag[];
    export type ParsedSelector = ParsedSelectorBlock[];
}

function parser(selector: string,
    options?: parser.ParserOptions): parser.ParsedSelector;
export = parser;
}
