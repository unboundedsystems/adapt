import { AdaptElement } from "@adpt/core";
import { findStackElems } from "../../src/aws/aws_plugin";

export function getStackNames(dom: AdaptElement): string[] {
    return findStackElems(dom).map((s) => s.props.StackName).sort();
}
