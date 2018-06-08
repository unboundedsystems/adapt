import unbs from "../../../src";
import { ComputeProps } from "../../Compute";
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
const EC2Instance = withCredentials(EC2InstanceNC);
export default EC2Instance;
