import unbs from "@usys/adapt";
import { ComputeProps } from "../Compute";
import { withCredentials, WithCredentials } from "./credentials";

export interface EC2Props extends ComputeProps, unbs.WithChildren {
    imageId: string;
    instanceType: string;
    regionName: string;
    sshKeyName?: string;
}

class EC2InstanceNC extends unbs.PrimitiveComponent<EC2Props & WithCredentials> {
}

// tslint:disable-next-line:variable-name
export const EC2Instance = withCredentials(EC2InstanceNC);
