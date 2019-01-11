import Adapt, {
    AdaptElement,
    build,
    BuildHelpers,
    createStateStore,
    deepFilterElemsToPublic,
    Group,
    handle,
    isElement,
    StateStore
} from "@usys/adapt";
import should from "should";

export class Prim extends Adapt.PrimitiveComponent<{ id: any, ready: () => boolean }> {

    async ready(helpers: BuildHelpers): Promise<boolean> {
        const hand = this.props.handle;
        if (!hand) return false;
        const status = await helpers.elementStatus<boolean>(hand);
        if (status === undefined) return false;
        return status;
    }

    async status() {
        return this.props.ready();
    }
}
import { Sequence } from "../src/Sequence";

describe("Sequence Component Tests", () => {
    it("Should instantiate with no children", async () => {
        const root = <Sequence />;
        const { contents: dom } = await build(root, null);
        should(dom).equal(null);
    });

    it("Should instantiate first child only", async () => {
        const root = <Sequence key="foo">
            <Prim key="1" id={1} ready={() => false} />
            <Prim key="2" id={2} ready={() => false} />
        </Sequence>;
        const { contents: dom } = await build(root, null);
        if (dom === null) throw should(dom).not.equal(null);
        const ref = deepFilterElemsToPublic(<Group key="foo"><Prim key="1" id={1} ready={() => true} /></Group>);
        should(deepFilterElemsToPublic(dom)).eql(ref);
    });

    async function buildAndCheck(
        root: AdaptElement,
        ref: AdaptElement | null,
        state?: StateStore): Promise<StateStore> {

        if (state === undefined) state = createStateStore();
        const { contents: dom } = await build(root, null, { stateStore: state });
        should(deepFilterElemsToPublic(dom)).eql(ref);
        return state;
    }

    it("Should instantiate full sequence", async () => {
        const ready = [false, false, false, false];
        const hand = handle();
        const stages = [
            <Prim key="1" id={1} ready={() => ready[0]} />,
            <Prim key="2" id={2} ready={() => ready[1]} />,
            hand,
            <Prim key="3" id={3} ready={() => ready[3]} />
        ];
        const root = <Group key="outer">
            <Prim key="outside" id="out" ready={() => ready[2]} handle={hand} />
            <Sequence key="foo">
                {...stages}
            </Sequence>
        </Group>;

        // tslint:disable-next-line:prefer-for-of
        let state = createStateStore();
        for (let stage = 0; stage < stages.length; stage++) {
            const ref = deepFilterElemsToPublic(<Group key="outer">
                <Prim key="outside" id={"out"} ready={() => ready[2]} />
                <Group key="foo">
                    {...stages.slice(0, stage + 1).filter(isElement)}
                </Group>
            </Group>);
            state = await buildAndCheck(root, ref, state);
            state = await buildAndCheck(root, ref, state);
            ready[stage] = true;
        }
    });

    it("Should instantiate full sequence, even if intermediate becomes unready", async () => {
        let ready2 = true;
        const root = <Sequence key="foo">
            <Prim key="1" id={1} ready={() => true} />
            <Prim key="2" id={2} ready={() => ready2} />
            <Prim key="3" id={3} ready={() => true} />
        </Sequence>;

        const ref1 = deepFilterElemsToPublic(<Group key="foo">
            <Prim key="1" id={1} ready={() => true} />
            <Prim key="2" id={2} ready={() => ready2} />
            <Prim key="3" id={3} ready={() => true} />
        </Group>);
        let state = await buildAndCheck(root, ref1);
        state = await buildAndCheck(root, ref1, state);

        ready2 = false;
        state = await buildAndCheck(root, ref1, state);
        state = await buildAndCheck(root, ref1, state);
    });
});
