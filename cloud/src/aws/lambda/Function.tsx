/*
 * Copyright 2020 Unbounded Systems, LLC
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

import Adapt, { Component } from "@adpt/core";
import {removeUndef} from "@adpt/utils";
import {CFResource} from "../CFResource";
import {withCredentials, WithCredentials} from "../credentials";

// Lambda - Function
// CF Docs: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-lambda-function-code.html

export interface FunctionProps extends WithCredentials {
    code: Code;
    deadLetterConfig?: DeadLetterConfig;
    description?: string;
    environment?: Environment;
    functionName?: string;
    handler: string;
    kmsKeyArn?: string;
    layers?: string[];
    memorySize?: number;
    reservedConcurrentExecutions?: number;
    role: string;
    runtime: string;
    tags: {[key: string]: string};
    timeout?: number;
    tracingConfig?: TracingConfig;
    vpcConfig?: VpcConfig;
}

export interface Code {
    s3Bucket?: string;
    s3Key?: string;
    s3ObjectVersion?: string;
    zipFile?: string;
}

export interface DeadLetterConfig {
    targetARN?: string;
}

export interface Environment {
    variables: {[key: string]: string};
}

export interface TracingConfig {
    mode?: string;
}

export interface VpcConfig {
    securityGroupIds: string[];
    subnetIds: string[];
}

interface TagPair {
    Key: string;
    Value: string;
}

function convertTags(tags: {[key: string]: string}): TagPair[] {
    const result = [];
    for (const key in tags) {
        if (tags.hasOwnProperty(key)) {
            result.push({
                Key: key,
                Value: tags[key],
            });
        }
    }
    return result;
}

class FunctionNC extends Component<FunctionProps> {
    build() {
        const props = this.props;

        const properties = removeUndef({
            Code: props.code,
            DeadLetterConfig: props.deadLetterConfig,
            Description: props.description,
            Environment: props.environment ? props.environment.variables : undefined,
            FunctionName: props.functionName,
            Handler: props.handler,
            KmsKeyArn: props.kmsKeyArn,
            Layers: props.layers,
            MemorySize: props.memorySize,
            ReservedConcurrentExecutions: props.reservedConcurrentExecutions,
            Role: props.role,
            Runtime: props.runtime,
            Tags: convertTags(props.tags || {}),
            Timeout: props.timeout,
            TracingConfig: props.tracingConfig,
            VpcConfig: props.vpcConfig,
        });

        return (
            <CFResource
                Type="AWS::Lambda::Function"
                Properties={properties}
            />
        );
    }
}

// tslint:disable-next-line:variable-name
export const Function = withCredentials(FunctionNC);
export default Function;
