import { UnbsElement, PrimitiveComponent } from './jsx';

export interface GroupProps {
    children?: UnbsElement[] | UnbsElement;
}

export class Group extends PrimitiveComponent<GroupProps> {}