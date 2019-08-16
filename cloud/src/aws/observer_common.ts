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

import jsonStableStringify from "json-stable-stringify";
import { AwsCredentialsProps } from "./credentials";

export interface AwsQueryParams extends AwsCredentialsProps { }

export type QueryParams = AwsQueryParams;

export const infoSym = Symbol("adaptObserverInfo");
export interface QueryResolverInfo {
    [infoSym]: AwsQueryParams;
}
export type ObserveResolverInfo = QueryResolverInfo;

export interface Observations {
    [queryId: string]: any;
}

export const withParamsProp = "withCredentials";

export function computeQueryId(queryParams: QueryParams, fieldName: string, args: unknown) {
    return jsonStableStringify({
        awsRegion: queryParams.awsRegion,
        awsAccessKeyId: queryParams.awsAccessKeyId,
        fieldName, //Note(manishv) should this really be the path in case operationId changes?
        args,
    });
}

export function opName(fieldName: string) {
    return fieldName[0].toLowerCase() + fieldName.substr(1);
}
