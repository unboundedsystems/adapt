import { notNull } from "@adpt/utils";
import * as util from "util";
import { Handle, isHandle } from "../handle";
import {
    AdaptElement,
    BuildHelpers,
    childrenToArray,
    Component,
    createElement,
    isElement,
    isReady,
} from "../jsx";
import { Children } from "../type_support";
import { Group } from "./group";

export interface SequenceProps extends Children<Handle | AdaptElement | null> { }

interface SequenceState {
    stage: number;
}

function checkChildren(kids: unknown[]) {
    for (const k of kids) {
        if (!isHandle(k) && !isElement(k)) {
            throw new Error("Child of Sequence component not element or handle: "
                + util.inspect(k));
        }
    }
}

export abstract class Sequence extends Component<SequenceProps, SequenceState> {
    static noPlugin = true;

    initialState() { return { stage: 0 }; }

    build(h: BuildHelpers): AdaptElement | null {
        if (this.props.children === undefined) return null;
        const stages = childrenToArray(this.props.children).filter(notNull);
        checkChildren(stages);

        this.setState(async (prev) => {
            const readyP = stages.slice(0, this.state.stage + 1).map((e) => isReady(h, e));
            const ready = await Promise.all(readyP);
            let nextStage = ready.findIndex((r) => !r);
            if (nextStage < 0) nextStage = ready.length;
            return { stage: Math.max(prev.stage, nextStage) };
        });

        return createElement(Group, { key: this.props.key },
            stages.slice(0, this.state.stage + 1).filter(isElement));
    }
}
