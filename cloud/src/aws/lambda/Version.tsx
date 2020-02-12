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

// Lambda - Version
// CF Docs: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-version.html

export interface VersionProps extends WithCredentials {
    codeSha256?: string;
    description?: string;
    functionName: string;
    provisionedConcurrencyConfig?: ProvisionedConcurrencyConfiguration;
}

export interface ProvisionedConcurrencyConfiguration {
    ProvisionedConcurrentExecutions: number;
}

class VersionNC extends Component<VersionProps> {
    build() {
        const props = this.props;

        const properties = removeUndef({
            CodeSha256: props.codeSha256,
            Description: props.description,
            FunctionName: props.functionName,
            ProvisionedConcurrencyConfig: props.provisionedConcurrencyConfig,
        });

        return (
            <CFResource
                Type="AWS::Lambda::Version"
                Properties={properties}
            />
        );
    }
}

// tslint:disable-next-line:variable-name
export const Version = withCredentials(VersionNC);
export default Version;
