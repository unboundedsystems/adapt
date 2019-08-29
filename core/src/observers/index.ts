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
    DocumentNode as GraphQLDocument,
} from "graphql";
import gqlTag from "graphql-tag";
import { ObserverNeedsData } from "./errors";
import { ExecutedQuery, Observations } from "./obs_manager_deployment";

export const gql: (literals: TemplateStringsArray, ...placeholders: any[]) => GraphQLDocument = gqlTag;

export {
    ObserverNeedsData,
    throwObserverErrors,
} from "./errors";

export {
    createObserverManagerDeployment,
    ObserverManagerDeployment,
    ExecutedQuery,
    simplifyNeedsData,
    ObserversThatNeedData,
    Observations,
    Variables,
} from "./obs_manager_deployment";

export {
    ObserverPlugin,
    ObserverResponse
} from "./plugin";

export {
    registerObserver,
    observe,
    makeObserverManagerDeployment,
    ObserverNameHolder,
} from "./registry";

export {
    Observer,
    ObserverProps,
} from "./Observer";

export function patchInNewQueries(observations: Observations, queries: { [name: string]: ExecutedQuery[] }): void {
    for (const name in observations) {
        if (!Object.hasOwnProperty.call(observations, name)) continue;
        if (queries[name] !== undefined) {
            observations[name].queries = queries[name];
        }
    }
}

export function isObserverNeedsData(e: any): e is ObserverNeedsData {
    return e instanceof ObserverNeedsData;
}
