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

// Lambda - Alias
// CF Docs: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-alias.html

export interface AliasProps extends WithCredentials {
    description?: string;
    functionName: string;
    functionVersion: string;
    name: string;
    provisionedConcurrencyConfig?: ProvisionedConcurrencyConfiguration;
    routingConfig?: AliasRoutingConfiguration;
}

export interface ProvisionedConcurrencyConfiguration {
    ProvisionedConcurrentExecutions: number;
}

export interface AliasRoutingConfiguration {
    AdditionalVersionWeights: FunctionWeight[];
}

export interface FunctionWeight {
    FunctionVersion: string;
    FunctionWeight: number;
}

class AliasNC extends Component<AliasProps> {
    build() {
        const props = this.props;

        const properties = removeUndef({
            Description: props.description,
            FunctionName: props.functionName,
            FunctionVersion: props.functionVersion,
            Name: props.name,
            ProvisionedConcurrencyConfig: props.provisionedConcurrencyConfig,
            RoutingConfig: props.routingConfig,
        });

        return (
            <CFResource
                Type="AWS::Lambda::Alias"
                Properties={properties}
            />
        );
    }
}

// tslint:disable-next-line:variable-name
export const Alias = withCredentials(AliasNC);
export default Alias;
