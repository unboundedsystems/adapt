import { Component, UnbsNode } from "../src";

export interface ComputeProps {
    name?: string;
    children?: UnbsNode | UnbsNode[];
}

export default abstract class Compute extends Component<ComputeProps> {
}
