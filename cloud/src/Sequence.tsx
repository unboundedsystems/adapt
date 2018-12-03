import Adapt, {
    AdaptElement,
    BuildHelpers,
    childrenToArray,
    Component,
    Group
} from "@usys/adapt";

export type ServicePort = number | string;

export interface SequenceProps {
    children?: AdaptElement | AdaptElement[];
}

interface SequenceState {
    stage: number;
}

export abstract class Sequence extends Component<SequenceProps, SequenceState> {
    initialState() { return { stage: 0 }; }

    build(h: BuildHelpers) {
        if (this.props.children === undefined) return null;
        const stages = childrenToArray(this.props.children);

        this.setState(async (prev) => {
            const readyP = stages.slice(0, this.state.stage + 1).map(async (e) => {
                const status = await h.elementStatus(e.props.handle);
                const readyF = e.componentType.ready || (() => true);
                return readyF(status);
            });
            const ready = await Promise.all(readyP);
            let nextStage = ready.findIndex((r) => !r);
            if (nextStage < 0) nextStage = ready.length;
            return { stage: Math.max(prev.stage, nextStage) };
        });

        return <Group key={this.props.key}>
            {...stages.slice(0, this.state.stage + 1)}
        </Group >;
    }
}
