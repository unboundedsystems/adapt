import { isInstance, tagConstructor } from "@adpt/utils";
import {
    Action,
    AdaptElement,
    ChangeType,
    FinalDomElement,
} from "../../src/";
import {
    Plugin,
} from "../../src/deploy/deploy_types";
import { domDiff } from "../../src/dom_utils";
import { DependPrim, DependProps } from "./common";

export interface ActionStateProps extends DependProps {
    action: (comp: ActionState) => void;
}

export interface ActionStateState {
    initial: string;
    current?: string;
    count?: number;
    deployed?: boolean;
}

export class ActionState extends DependPrim<ActionStateProps, ActionStateState> {
    static defaultProps = DependPrim.defaultProps;
    action?: () => void;

    constructor(props: ActionStateProps) {
        super(props);
        // Use state to determine whether plugin will generate a real action
        // vs. ChangeType.none
        if (this.state.deployed !== true && this.props.action) {
            this.action = () => this.props.action(this);
        }
    }
    initialState() {
        return { initial: "initial" };
    }
}
tagConstructor(ActionState);

function isActionStateElem(elem: AdaptElement) {
    return isInstance(elem.componentType.prototype, ActionState);
}

export class ActionStatePlugin implements Plugin<{}> {
    async start() {/* */}
    async observe() { return {}; }
    analyze(oldDom: FinalDomElement | null, newDom: FinalDomElement | null, _obs: {}): Action[] {
        const diff = domDiff(oldDom, newDom);
        const actions = (elems: FinalDomElement[], ct: ChangeType) => {
            return elems
                .filter(isActionStateElem)
                .map((el, i) => {
                    const type = el.instance.action ? ct : ChangeType.none;
                    return {
                        act: () => el.instance.action && el.instance.action(),
                        type,
                        detail: `Action ${i}`,
                        changes: [{
                            type,
                            element: el,
                            detail: `Action ${i}`,
                        }]
                    };
                });
        };

        return actions([...diff.added], ChangeType.create)
            .concat(actions([...diff.commonNew], ChangeType.modify))
            .concat(actions([...diff.deleted], ChangeType.delete));
    }
    async finish() {/* */}
}

export function createActionStatePlugin() {
    return new ActionStatePlugin();
}
