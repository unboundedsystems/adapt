import { AdaptElementOrNull, PrimitiveComponent } from "./jsx";

export interface GroupProps {
    children?: AdaptElementOrNull[] | AdaptElementOrNull;
}
export class Group extends PrimitiveComponent<GroupProps> { }

export interface DomErrorProps {
    children: string;
}
export class DomError extends PrimitiveComponent<DomErrorProps> { }
