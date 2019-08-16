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

class VictimInternal extends Living {}

// The variable "module" can't be exported directly. Only a local variable
// can be exported.
const thisModule = module;

// Ensure export happens before registerObject
export {
    VictimInternal as Victim,
    thisModule as module,
};

registerObject(VictimInternal, "VictimReg", module);
