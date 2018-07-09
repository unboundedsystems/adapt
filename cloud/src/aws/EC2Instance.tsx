import Adapt from "@usys/adapt";
import { ComputeProps } from "../Compute";
import { withCredentials, WithCredentials } from "./credentials";

export interface EC2Props extends ComputeProps, Adapt.WithChildren {
    imageId: string;
    instanceType: string;
    regionName: string;
    sshKeyName?: string;
}

class EC2InstanceNC extends Adapt.PrimitiveComponent<EC2Props & WithCredentials, {}> {
}

// tslint:disable-next-line:variable-name
export const EC2Instance = withCredentials(EC2InstanceNC);
