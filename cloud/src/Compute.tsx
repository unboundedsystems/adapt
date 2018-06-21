import { Component, WithChildren } from "@usys/adapt";

export interface ComputeProps extends WithChildren {
    name?: string;
    ip?: string;
}

export abstract class Compute extends Component<ComputeProps> {
}
export default Compute;
