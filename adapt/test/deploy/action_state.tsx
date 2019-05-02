import {
    Action,
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
}

export class ActionState extends DependPrim<ActionStateProps, ActionStateState> {
    static defaultProps = DependPrim.defaultProps;
    initialState() {
        return { initial: "initial" };
    }
    action() {
        this.props.action(this);
    }
}

export class ActionStatePlugin implements Plugin<{}> {
    async start() {/* */}
    async observe() { return {}; }
    analyze(oldDom: FinalDomElement | null, newDom: FinalDomElement | null, _obs: {}): Action[] {
        const diff = domDiff(oldDom, newDom);
        const actions = (elems: FinalDomElement[], type: ChangeType) => {
            return elems
                .filter((el) => el.instance.action != null)
                .map((el, i) => ({
                    act: () => el.instance.action(),
                    type,
                    detail: `Action ${i}`,
                    changes: [{
                        type,
                        element: el,
                        detail: `Action ${i}`,
                    }]
                }));
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
