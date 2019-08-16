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

import { CustomError } from "ts-custom-error";
import { isInstance, tagConstructor } from "./is_instance";

export class MultiError extends CustomError {
    public constructor(public errors: ReadonlyArray<Error>) {
        super();
        this.message = errors.length === 0 ? "No errors" :
            "Errors:\n" + errors.map((e) => e.message || e.toString()).join("\n");
    }
}
tagConstructor(MultiError, "adapt/utils");

export function isMultiError(err: any): err is MultiError {
    return isInstance(err, MultiError, "adapt/utils");
}
