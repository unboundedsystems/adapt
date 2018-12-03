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

export type ServicePort = number | string;

export interface SequenceProps {
    children?: AdaptElement | Handle | (AdaptElement | Handle)[];
}

interface SequenceState {
    stage: number;
}

function isReady(h: BuildHelpers): (e: AdaptElement | Handle) => Promise<boolean> {
    return async (e) => {
        let handle: Handle;
        let componentType: any;
        if (isElement(e)) {
            handle = e.props.handle;
            componentType = e.componentType;
        } else if (isHandle(e)) {
            handle = e;
            const elem = e.mountedOrig;
            if (elem === undefined) throw new Error("element has no mountedOrig!");
            if (elem === null) return true;
            componentType = elem.componentType;
        } else {
            throw new Error("Child of Sequence component not element or handle: " + util.inspect(e));
        }
        const readyF = componentType.ready;
        if (!readyF) return true;
        const status = await h.elementStatus(handle);
        return readyF(status);
    };
}

export abstract class Sequence extends Component<SequenceProps, SequenceState> {
    initialState() { return { stage: 0 }; }

    build(h: BuildHelpers) {
        if (this.props.children === undefined) return null;
        const stages = childrenToArray(this.props.children) as (AdaptElement | Handle)[];

        this.setState(async (prev) => {
            const readyP = stages.slice(0, this.state.stage + 1).map(isReady(h));
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
