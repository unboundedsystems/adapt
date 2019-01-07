import aws from "aws-sdk";

import Adapt, {
    AdaptPrimitiveElement,
    BuildData,
    childrenToArray,
    Component,
    gql,
    isElement,
    isPrimitiveElement,
    mergeDefaultChildStatus,
    ObserveForStatus,
    PrimitiveComponent,
    Status,
    WithChildren,
} from "@usys/adapt";
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

const resourceIds = resourceIdList("StackName");

export type CFStackPrimitiveProps =
    aws.CloudFormation.CreateStackInput &
    WithChildren &
    WithCredentials;

export type Capability =
    "CAPABILITY_IAM" |
    "CAPABILITY_NAMED_IAM" |
    "CAPABILITY_AUTO_EXPAND";

export interface StackDriftInformation {
    StackDriftStatus: "DRIFTED" | "IN_SYNC" | "UNKNOWN" | "NOT_CHECKED";
    LastCheckTimestamp: string | null;
}

export interface Output {
    OutputKey: string | null;
    OutputValue: string | null;
    Description: string | null;
    ExportName: string | null;
}

export interface Parameter {
    ParameterKey: string | null;
    ParameterValue: string | null;
    UsePreviousValue: boolean | null;
    ResolvedValue: string | null;
}

export interface RollbackTrigger {
    Arn: string;
    Type: string;
}

export interface RollbackConfiguration {
    RollbackTriggers: RollbackTrigger[];
    MonitoringTimeInMinutes: number | null;
}

export interface Tag {
    Key: string;
    Value: string;
}

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

export class CFStackPrimitive extends PrimitiveComponent<CFStackPrimitiveProps> {
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
            if (isCFStackPrimitiveElement(k)) throw new Error(`Stack within stack`);
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

// Input props for CFStack allow passing a ResourceId to props.StackName
export type CFStackProps =
    OverwriteT<CFStackPrimitiveProps, ResourceIdProps<typeof resourceIds>>;

export interface CFStackState extends ResourceIdState<typeof resourceIds> {
}

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
        const { handle, ...primProps } = { ...this.props, ...ids };
        return <CFStackPrimitive {...primProps} />;
    }
}

export function isCFStackPrimitiveElement(val: any): val is AdaptPrimitiveElement<CFStackPrimitiveProps> {
    return isPrimitiveElement(val) && val.componentType === CFStackPrimitive;
}

// tslint:disable-next-line:variable-name
export const CFStack = withCredentials(CFStackBase);
