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
        const userData = (typeof props.userData === "string") ?
            new Buffer(props.userData).toString("base64") : undefined;
        const tags = props.name ? [ { Key: "Name", Value: props.name } ] : undefined;

        const properties = removeUndef({
            InstanceType: props.instanceType,
            KeyName: props.sshKeyName,
            ImageId: props.imageId,
            SecurityGroups: props.securityGroups,
            Tags: tags,
            UserData: userData,
        });

        return <CFResource Type="AWS::EC2::Instance" Properties={properties} />;
    }
}

// tslint:disable-next-line:variable-name
export const EC2Instance = withCredentials(EC2InstanceNC);
