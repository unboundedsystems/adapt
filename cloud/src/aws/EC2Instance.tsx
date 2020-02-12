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

import Adapt, {
    BuildData,
    BuildHelpers,
    Component,
    gql,
    mergeDefaultChildStatus,
    ObserveForStatus,
    Status,
    WithChildren,
} from "@adpt/core";
import { removeUndef } from "@adpt/utils";
import { flatten } from "lodash";
import { ComputeProps } from "../Compute";
import AWS from "./aws-sdk";
import { CFResource } from "./CFResource";
import { withCredentials, WithCredentials } from "./credentials";
import { AwsEc2Observer } from "./ec2_observer";
import { adaptDeployIdTag, adaptResourceId, adaptResourceIdTag } from "./plugin_utils";

/** @beta */
export interface EC2Props extends ComputeProps, WithChildren, WithCredentials {
    imageId: string;
    instanceType: string;
    sshKeyName: string;
    securityGroups: string[];
    userData?: string;
}

/** @beta */
export interface EC2InstanceStatus extends Status, AWS.EC2.Instance { }

const resourceType = "AWS::EC2::Instance";

/** @beta */
class EC2InstanceNC extends Component<EC2Props> {
    build() {
        const props = this.props;

        const properties = removeUndef({
            InstanceType: props.instanceType,
            KeyName: props.sshKeyName,
            ImageId: props.imageId,
            SecurityGroups: props.securityGroups,
            Tags: props.name ? [ { Key: "Name", Value: props.name } ] : undefined,
            UserData: (typeof props.userData === "string") ?
                Buffer.from(props.userData).toString("base64") : undefined,
        });

        return (
            <CFResource key={props.key} Type={resourceType} Properties={properties} >
                {props.children}
            </CFResource>
        );
    }

    async ready(helpers: BuildHelpers) {
        const hand = this.props.handle;
        if (!hand) return false;
        const status = await helpers.elementStatus<EC2InstanceStatus>(hand);
        if (!status) return false;
        return status.State != null && status.State.Name === "running";
    }

    async status(observe: ObserveForStatus, buildData: BuildData): Promise<EC2InstanceStatus> {
        const isActive = (inst: AWS.EC2.Instance) => inst.State && inst.State.Name !== "terminated";
        const { awsCredentials } = this.props;
        const hand = this.props.handle;
        if (!hand) throw new Error(`EC2InstanceNC component handle is null`);
        const resourceId = adaptResourceId(hand);

        if (awsCredentials == null) {
            throw new Error(`awsCredentials must be provided`);
        }

        const obsP: Promise<any> = observe(AwsEc2Observer, gql`
            query (
                $input: DescribeInstancesRequest_input!,
                $awsAccessKeyId: String!,
                $awsSecretAccessKey: String!,
                $awsRegion: String!
                ) {
                withCredentials(
                    awsAccessKeyId: $awsAccessKeyId,
                    awsSecretAccessKey: $awsSecretAccessKey,
                    awsRegion: $awsRegion
                    ) {
                    DescribeInstances(body: $input) @all(depth: 10)
                }
            }`,
            {
                input: {
                    Filters: [
                        {
                            Name: `tag:${adaptResourceIdTag}`,
                            Values: [ resourceId ]
                        },
                        {
                            Name: `tag:${adaptDeployIdTag}`,
                            Values: [ buildData.deployID ]
                        }
                    ]
                },
                ...awsCredentials,
            }
        );

        return mergeDefaultChildStatus(this.props, obsP, observe, buildData, (obs: any) => {
            let noStatus;

            const reservations = obs.withCredentials.DescribeInstances.Reservations;
            if (!Array.isArray(reservations)) {
                noStatus = `Unexpected response from AWS API: ${reservations}`;
            } else {
                const instances = flatten(reservations.map((r) => r.Instances));
                const active = instances.filter(isActive);

                if (active.length === 1) return active[0];
                noStatus = active.length === 0 ?
                    `EC2Instance with ID ${resourceId} does not exist` :
                    `Multiple EC2Instances with ID ${resourceId} exist`;
            }

            const stat: EC2InstanceStatus = { noStatus };
            return stat;
        });
    }
}

/** @beta */
// tslint:disable-next-line:variable-name
export const EC2Instance = withCredentials(EC2InstanceNC);
