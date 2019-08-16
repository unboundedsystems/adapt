/*
 * Copyright 2019 Unbounded Systems, LLC
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

import { CommonOptions, run } from "./common";

export interface AddOptions extends CommonOptions {
    dev?: boolean;
    peer?: boolean;
    optional?: boolean;
    exact?: boolean;
    tilde?: boolean;
}
const boolNoArgOptions = [
    "dev",
    "peer",
    "optional",
    "exact",
    "tilde",
];

const defaultOptions = {
    boolNoArgOptions,
};

export function add(options: AddOptions = {}) {
    const finalOpts = { ...defaultOptions, ...options };
    return run("add", finalOpts);
}
