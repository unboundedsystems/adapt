import { PrimitiveComponent, UnbsNode } from "./jsx";

export interface GroupProps {
    children?: UnbsNode[] | UnbsNode;
}

export class Group extends PrimitiveComponent<GroupProps> { }
