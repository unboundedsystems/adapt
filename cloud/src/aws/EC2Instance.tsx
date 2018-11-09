import Adapt, { Component, WithChildren} from "@usys/adapt";
import { removeUndef } from "@usys/utils";
import { ComputeProps } from "../Compute";
import { CFResource } from "./CFResource";
import { withCredentials, WithCredentials } from "./credentials";

export interface EC2Props extends ComputeProps, WithChildren, WithCredentials {
    imageId: string;
    instanceType: string;
    sshKeyName: string;
    securityGroups: string[];
    userData?: string;
}

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
            <CFResource key={props.key} Type="AWS::EC2::Instance" Properties={properties} >
                {props.children}
            </CFResource>
        );
    }
}

// tslint:disable-next-line:variable-name
export const EC2Instance = withCredentials(EC2InstanceNC);
