import { PrimitiveComponent } from "../../../src";
import { ComputeProps } from "../../Compute";

export type LocalComputeProps = ComputeProps;

export default class LocalCompute extends PrimitiveComponent<ComputeProps> {
    static defaultProps = {
        ip: "127.0.0.1",
    };
}
