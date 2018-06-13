import { Component, WithChildren } from "../src";

export interface ComputeProps extends WithChildren {
    name?: string;
    ip?: string;
}

export default abstract class Compute extends Component<ComputeProps> {
}
