import Adapt, { AdaptElement, build, createStateStore, deepFilterElemsToPublic, Group, StateStore } from "@usys/adapt";
import should from "should";

export class Prim extends Adapt.PrimitiveComponent<{ id: any, ready: () => boolean }> {

    static ready(status: boolean) {
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
        let ready1 = false;
        let ready2 = false;
        const ready3 = false;
        const stages = [
            <Prim key="1" id={1} ready={() => ready1} />,
            <Prim key="2" id={2} ready={() => ready2} />,
            <Prim key="3" id={3} ready={() => ready3} />
        ];
        const root = <Sequence key="foo">
            {...stages}
        </Sequence>;

        const ref1 = deepFilterElemsToPublic(<Group key="foo">
            {...stages.slice(0, 1)}
        </Group>);
        let state = await buildAndCheck(root, ref1);
        state = await buildAndCheck(root, ref1, state);

        ready1 = true;
        const ref2 = deepFilterElemsToPublic(<Group key="foo">
            {...stages.slice(0, 2)}
        </Group>);
        state = await buildAndCheck(root, ref2, state);
        state = await buildAndCheck(root, ref2, state);

        ready2 = true;
        const ref3 = deepFilterElemsToPublic(<Group key="foo">
            {...stages}
        </Group>);
        state = await buildAndCheck(root, ref3, state);
        state = await buildAndCheck(root, ref3, state);
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
