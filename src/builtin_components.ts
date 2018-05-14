import * as ld from 'lodash';
import { UnbsElement, Component, createElement } from './jsx';

export interface GroupProps {
    children?: UnbsElement[] | UnbsElement;
}

export class Group extends Component<GroupProps> {
    constructor(props: GroupProps) {
        super(props);
    }

    build(): UnbsElement {
        //FIXME(manishv)  This is wrong, we have to 
        //actually instaniate things here, otherwise we just keep looping trying
        //to resolve the group element that is returned every time.
        let children: UnbsElement[] = [];
        if (this.props.children != null) {
            if (ld.isArray(this.props.children)) {
                children = this.props.children;
            } else {
                children = [this.props.children];
            }
        }
        let args: any[] = [Group, this.props];
        return createElement.apply(null, args.concat(children));
    }
}