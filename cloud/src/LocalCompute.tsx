import { PrimitiveComponent } from "@usys/adapt";
import { ComputeProps } from "./Compute";

export type LocalComputeProps = ComputeProps;

export class LocalCompute extends PrimitiveComponent<ComputeProps> {
    static defaultProps = {
        ip: "127.0.0.1",
    };
    static noPlugin = true;
}
export default LocalCompute;
