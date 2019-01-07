import Adapt, {
    BuildData,
    Component,
    gql,
    mergeDefaultChildStatus,
    ObserveForStatus,
    Status,
    WithChildren,
} from "@usys/adapt";
import { removeUndef } from "@usys/utils";
import AWS from "aws-sdk";
import { ComputeProps } from "../Compute";
import { CFResource } from "./CFResource";
import { withCredentials, WithCredentials } from "./credentials";
import { AwsEc2Observer } from "./ec2_observer";
import { adaptDeployIdTag, adaptId, adaptResourceIdTag } from "./plugin_utils";

export interface EC2Props extends ComputeProps, WithChildren, WithCredentials {
    imageId: string;
    instanceType: string;
    sshKeyName: string;
    securityGroups: string[];
    userData?: string;
}

export interface EC2InstanceStatus extends Status, AWS.EC2.Instance { }

const resourceType = "AWS::EC2::Instance";

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

    async status(observe: ObserveForStatus, buildData: BuildData): Promise<EC2InstanceStatus> {
        const { awsCredentials } = this.props;
        const resource = buildData.successor;
        if (resource == null) throw new Error(`Internal Error: EC2Instance has no successor`);
        const resourceId = adaptId(resourceType, resource.id);

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

        return mergeDefaultChildStatus(this.props, obsP, observe,
            buildData, (obs: any) => {
            let noStatus = "";

            const reservations = obs.withCredentials.DescribeInstances.Reservations;
            if (!Array.isArray(reservations)) {
                noStatus = `Unexpected response from AWS API: ${reservations}`;
            } else if (reservations.length === 0) {
                noStatus = `EC2Instance with ID ${resourceId} does not exist`;
            } else if (reservations.length > 1) {
                noStatus = `Multiple EC2Instances with ID ${resourceId} exist`;
            }

            const stat: EC2InstanceStatus = noStatus ?
                { noStatus } : reservations[0].Instances[0];
            return stat;
        });
    }
}

// tslint:disable-next-line:variable-name
export const EC2Instance = withCredentials(EC2InstanceNC);
