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

// Lambda - Layer Version
// CF Docs: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-layerversion.html

export interface LayerVersionProps extends WithCredentials {
    compatibleRuntimes?: string[];
    content: Content;
    description?: string;
    layerName: string;
    licenseInfo: string;
}

export interface Content {
    S3Bucket: string;
    S3Key: string;
    S3ObjectVersion?: string;
}

class LayerVersionNC extends Component<LayerVersionProps> {
    build() {
        const props = this.props;

        const properties = removeUndef({
            CompatibleRuntimes: props.compatibleRuntimes,
            Content: props.content,
            Description: props.description,
            LayerName: props.layerName,
            LicenseInfo: props.licenseInfo,
        });

        return (
            <CFResource
                Type="AWS::Lambda::LayerVersion"
                Properties={properties}
            />
        );
    }
}

// tslint:disable-next-line:variable-name
export const LayerVersion = withCredentials(LayerVersionNC);
export default LayerVersion;
