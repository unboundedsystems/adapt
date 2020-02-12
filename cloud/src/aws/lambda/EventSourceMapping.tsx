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

// Lambda - Event Source Mapping
// CF Docs: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-eventsourcemapping.html

export interface EventSourceMappingProps extends WithCredentials {
    batchSize?: number;
    bisectBatchOnFunctionError?: boolean;
    destinationConfig?: DestinationConfig;
    enabled?: boolean;
    eventSourceArn: string;
    functionName: string;
    maximumBatchingWindowInSeconds?: number;
    maximumRecordAgeInSeconds?: number;
    maximumRetryAttempts?: number;
    parallelizationFactor?: number;
    startingPosition?: string;
}

export interface DestinationConfig {
    OnFailure: OnFailure;
}

export interface OnFailure {
    Destination: string;
}

class EventSourceMappingNC extends Component<EventSourceMappingProps> {
    build() {
        const props = this.props;

        const properties = removeUndef({
            BatchSize: props.batchSize,
            BisectBatchOnFunctionError: props.bisectBatchOnFunctionError,
            DestinationConfig: props.destinationConfig,
            Enabled: props.enabled,
            EventSourceArn: props.eventSourceArn,
            FunctionName: props.functionName,
            MaximumBatchingWindowInSeconds: props.maximumBatchingWindowInSeconds,
            MaximumRecordAgeInSeconds: props.maximumRecordAgeInSeconds,
            MaximumRetryAttempts: props.maximumRetryAttempts,
            ParallelizationFactor: props.parallelizationFactor,
            StartingPosition: props.startingPosition,
        });

        return (
            <CFResource
                Type="AWS::Lambda::EventSourceMapping"
                Properties={properties}
            />
        );
    }
}

// tslint:disable-next-line:variable-name
export const EventSourceMapping = withCredentials(EventSourceMappingNC);
export default EventSourceMapping;
