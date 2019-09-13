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

import aws from "aws-sdk";

import Adapt, {
    BuildData,
    childrenToArray,
    Component,
    DeployedWhenMethod,
    DeployStatus,
    FinalDomElement,
    gql,
    handle,
    isElement,
    isFinalDomElement,
    mergeDefaultChildStatus,
    ObserveForStatus,
    PrimitiveComponent,
    Status,
    waiting,
    WithChildren,
} from "@adpt/core";
import { OverwriteT } from "type-ops";
import {
    getResourceIds,
    resourceIdList,
    ResourceIdPolicy,
    ResourceIdProps,
    ResourceIdState,
    updateResourceIdState
} from "../resource_id";
import { AwsCfObserver } from "./cf_observer";
import { withCredentials, WithCredentials } from "./credentials";
import { CFStackContext } from "./stack_context";

const resourceIds = resourceIdList("StackName");

/** @beta */
export type CFStackPrimitiveProps =
    aws.CloudFormation.CreateStackInput &
    WithChildren &
    WithCredentials;

/** @beta */
export type Capability =
    "CAPABILITY_IAM" |
    "CAPABILITY_NAMED_IAM" |
    "CAPABILITY_AUTO_EXPAND";

/** @beta */
export interface StackDriftInformation {
    StackDriftStatus: "DRIFTED" | "IN_SYNC" | "UNKNOWN" | "NOT_CHECKED";
    LastCheckTimestamp: string | null;
}

/** @beta */
export interface Output {
    OutputKey: string | null;
    OutputValue: string | null;
    Description: string | null;
    ExportName: string | null;
}

/** @beta */
export interface Parameter {
    ParameterKey: string | null;
    ParameterValue: string | null;
    UsePreviousValue: boolean | null;
    ResolvedValue: string | null;
}

/** @beta */
export interface RollbackTrigger {
    Arn: string;
    Type: string;
}

/** @beta */
export interface RollbackConfiguration {
    RollbackTriggers: RollbackTrigger[];
    MonitoringTimeInMinutes: number | null;
}

/** @beta */
export interface Tag {
    Key: string;
    Value: string;
}

/** @beta */
export interface CFStackStatus extends Status {
    Capabilities: Capability[];
    ChangeSetId: string | null;
    CreationTime: string;
    DeletionTime: string | null;
    Description: string | null;
    DisableRollback: boolean;
    DriftInformation: StackDriftInformation | null;
    EnableTerminationProtection: boolean;
    LastUpdatedTime: string | null;
    NotificationARNs: string[];
    Outputs: Output[];
    Parameters: Parameter[];
    ParentId: string | null;
    RoleARN: string | null;
    RollbackConfiguration: RollbackConfiguration;
    RootId: string | null;
    StackId: string | null;
    StackName: string;
    StackStatus: string;
    StackStatusReason: string | null;
    Tags: Tag[];
    TimeoutInMinutes: number | null;
}

/** @beta */
export class CFStackPrimitive extends PrimitiveComponent<CFStackPrimitiveProps> {

    deployedWhen: DeployedWhenMethod = async (goalStatus, helpers) => {
        const hand = this.props.handle;
        if (!hand) throw new Error("Invalid handle");

        const status = await helpers.elementStatus<CFStackStatus>(hand);
        if (!status) return waiting("No status returned by EC2 API");
        if (status.StackStatus) {
            switch (status.StackStatus) {
                case "CREATE_COMPLETE":
                case "UPDATE_COMPLETE":
                    return goalStatus === DeployStatus.Deployed ? true :
                        waiting(`Unexpected StackStatus ${status.StackStatus}`);
                case "DELETE_COMPLETE":
                    return goalStatus === DeployStatus.Destroyed ? true :
                        waiting(`Unexpected StackStatus ${status.StackStatus}`);
                case "CREATE_IN_PROGRESS":
                case "UPDATE_IN_PROGRESS":
                case "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS":
                case "REVIEW_IN_PROGRESS":
                case "DELETE_IN_PROGRESS":
                    return waiting(status.StackStatus);
                case "ROLLBACK_IN_PROGRESS":
                case "ROLLBACK_COMPLETE":
                case "UPDATE_ROLLBACK_IN_PROGRESS":
                case "UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS":
                case "UPDATE_ROLLBACK_COMPLETE":
                case "CREATE_FAILED":
                case "ROLLBACK_FAILED":
                case "UPDATE_ROLLBACK_FAILED":
                case "DELETE_FAILED":
                default:
                    throw new Error(
                        `Operation failed (${status.StackStatus}): ` +
                        status.StackStatusReason);
            }
        }
        if (status.noStatus === `Stack with id ${this.props.StackName} does not exist`) {
            return goalStatus === DeployStatus.Destroyed ? true :
                waiting(`Stack not found`);
        }
        if (typeof status.noStatus === "string") {
            throw new Error("Unable to get status: " + status.noStatus);
        }
        throw new Error("Invalid status returned by EC2 API");
    }

    validate() {
        try {
            this.validateChildren(this.props.children);
        } catch (err) {
            if (err instanceof Error && err.message === "Stack within stack") {
                return "Nested CFStacks are not currently supported";
            }
        }
        return;
    }

    // FIXME(mark): This *should* happen during DOM validation, but the
    // time complexity of this sucks. A more efficient check would be to
    // traverse parents to the root, looking for a CFStackPrimitive, but we
    // don't currently have parent info in validate.
    validateChildren(children: any) {
        for (const k of childrenToArray(children)) {
            if (isCFStackPrimitiveFinalElement(k)) throw new Error(`Stack within stack`);
            if (isElement<WithChildren>(k)) this.validateChildren(k.props.children);
        }
    }

    async status(observe: ObserveForStatus, buildData: BuildData): Promise<Status> {
        const { awsCredentials, StackName } = this.props;
        if (awsCredentials == null) {
            throw new Error(`awsCredentials must be provided to CFStack`);
        }

        const obsP: Promise<any> = observe(AwsCfObserver, gql`
            query (
                $input: DescribeStacksInput_input!,
                $awsAccessKeyId: String!,
                $awsSecretAccessKey: String!,
                $awsRegion: String!
                ) {
                withCredentials(
                    awsAccessKeyId: $awsAccessKeyId,
                    awsSecretAccessKey: $awsSecretAccessKey,
                    awsRegion: $awsRegion
                    ) {
                    DescribeStacks(body: $input) @all(depth: 10)
                }
            }`,
            {
                input: { StackName },
                ...awsCredentials,
            }
        );

        return mergeDefaultChildStatus(this.props, obsP, observe,
            buildData, (obs: any) => {

                return obs.withCredentials.DescribeStacks.Stacks[0];
            });
    }
}

/** @beta */
// Input props for CFStack allow passing a ResourceId to props.StackName
export type CFStackProps =
    OverwriteT<CFStackPrimitiveProps, ResourceIdProps<typeof resourceIds>>;

/** @beta */
export interface CFStackState extends ResourceIdState<typeof resourceIds> {
}

/** @beta */
export class CFStackBase extends Component<CFStackProps, CFStackState> {

    constructor(props: CFStackProps) {
        super(props);
        this.setState((prev) =>
            updateResourceIdState(resourceIds, props, prev,
                ResourceIdPolicy.local, { separator: "-" })
        );
    }

    initialState() { return {}; }

    build() {
        const ids = getResourceIds(resourceIds, this.state);
        if (ids == null) return null; // Haven't completed first state update

        // Make sure StackName (and any other ResourceIds are just strings
        // in the primitive component)
        const { handle: _h, ...primProps } = { ...this.props, ...ids };
        const pHandle = handle();
        return (
            <CFStackContext.Provider key={this.props.key} value={pHandle}>
                <CFStackPrimitive {...primProps} handle={pHandle} />
            </CFStackContext.Provider>
        );
    }
}

/** @beta */
export function isCFStackPrimitiveFinalElement(val: any): val is FinalDomElement<CFStackPrimitiveProps> {
    return isFinalDomElement(val) && val.componentType === CFStackPrimitive;
}

/** @beta */
// tslint:disable-next-line:variable-name
export const CFStack = withCredentials(CFStackBase);
