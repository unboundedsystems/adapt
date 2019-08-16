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

import Adapt, { Component, Handle } from "@adpt/core";
import { tuple } from "@adpt/utils";
import { pick } from "lodash";
import { CFResource } from "./CFResource";
import { withCredentials, WithCredentials } from "./credentials";

export interface EIPAssociationProps extends WithCredentials {
    AllocationId?: string;
    EIP?: string;
    InstanceId?: string | Handle;
    NetworkInterfaceId?: string;
    PrivateIpAddress?: string;
}

const resourceProps = tuple(
    "AllocationId",
    "EIP",
    "InstanceId",
    "NetworkInterfaceId",
    "PrivateIpAddress",
);

class EIPAssociationNC extends Component<EIPAssociationProps> {
    build() {
        const properties = pick(this.props, resourceProps);

        return (
            <CFResource
                Type="AWS::EC2::EIPAssociation"
                Properties={properties}
                tagsUnsupported={true}
            />);
    }
}

// tslint:disable-next-line:variable-name
export const EIPAssociation = withCredentials(EIPAssociationNC);
export default EIPAssociation;
