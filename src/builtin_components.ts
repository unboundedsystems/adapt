import { PrimitiveComponent, UnbsElementOrNull } from "./jsx";

export interface GroupProps {
    children?: UnbsElementOrNull[] | UnbsElementOrNull;
}

export class Group extends PrimitiveComponent<GroupProps> { }
