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

import { MultiError, notNull } from "@adpt/utils";
import { ExecutionResult, GraphQLError } from "graphql";
import { flatten } from "lodash";
import { CustomError } from "ts-custom-error";

export class ObserverNeedsData extends CustomError {
    public constructor(message?: string) {
        super("Adapt Observer Needs Data: " + (message ? message : "<no message>"));
    }
}

export function throwObserverErrors(results: ExecutionResult[]) {
    const errors = results.map((r) => r.errors).filter(notNull);
    if (errors.length === 0) return;
    // Type assertion below is due to inability of type def for flatten to
    // accept a ReadonlyArray. See comment on "Many" type in lodash .d.ts file.
    throw new MultiError(flatten(errors as GraphQLError[][]));
}
