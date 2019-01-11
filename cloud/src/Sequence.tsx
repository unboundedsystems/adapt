import Adapt, {
    AdaptElement,
    BuildHelpers,
    childrenToArray,
    Component,
    Group,
    Handle,
    isElement,
    isHandle
} from "@usys/adapt";
import * as util from "util";
import { isReady } from "./ready";

export interface SequenceProps {
    children?: AdaptElement | Handle | (AdaptElement | Handle)[];
}

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
    initialState() { return { stage: 0 }; }

    build(h: BuildHelpers) {
        if (this.props.children === undefined) return null;
        const stages = childrenToArray(this.props.children) as (AdaptElement | Handle)[];
        checkChildren(stages);

        this.setState(async (prev) => {
            const readyP = stages.slice(0, this.state.stage + 1).map((e) => isReady(h, e));
            const ready = await Promise.all(readyP);
            let nextStage = ready.findIndex((r) => !r);
            if (nextStage < 0) nextStage = ready.length;
            return { stage: Math.max(prev.stage, nextStage) };
        });

        return <Group key={this.props.key}>
            {...stages.slice(0, this.state.stage + 1).filter(isElement)}
        </Group >;
    }
}
