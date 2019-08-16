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

import { registerObject } from "../../src/reanimate";
import { Living } from "./test_living";

class InFuncInternal extends Living {}

// The variable "module" can't be exported directly. Only a local variable
// can be exported.
const thisModule = module;
export {
    thisModule as module,
    InFuncInternal as InFunc,
};

export function doRegister(mod?: NodeModule | number) {
    registerObject(InFuncInternal, "InFuncReg", mod);
}
