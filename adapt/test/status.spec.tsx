import * as ld from "lodash";
import * as should from "should";
import Adapt, { Component, gql, ObserveForStatus, PrimitiveComponent } from "../src";
import MockObserver from "../src/observers/MockObserver";

class PrimitiveMockStatus extends PrimitiveComponent<{}, {}> {
    async status(observe: ObserveForStatus<any>) {
        const obs = await observe(MockObserver, gql`{ mockById(id: 10) { idSquared } }`);
        if (!obs) return undefined;
        return obs.mockById;
    }
}

class MockStatus extends Component<{}, {}> {
    async status(observe: ObserveForStatus<any>) {
        const obs = await observe(MockObserver, gql`{ mockById(id: 5) { idSquared } }`);
        if (!obs) return undefined;
        return obs.mockById;
    }

    build() {
        return <PrimitiveMockStatus />;
    }
}

class BogusObserve extends PrimitiveComponent<{}, {}> {
    async status(observe: ObserveForStatus<any>) {
        const obs = await observe({ observerName: "doesNotExist" }, gql`{ foo }`);
        return obs;
    }
}

describe("Observation for component status", () => {
    it("should allow primitive component to observe", async () => {
        const root = <PrimitiveMockStatus />;
        const { mountedOrig } = await Adapt.build(root, null);
        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        should(ld.clone(await mountedOrig.status())).eql({ idSquared: 100 });
    });

    it("should allow component to observe", async () => {
        const root = <MockStatus />;
        const { mountedOrig } = await Adapt.build(root, null);
        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        should(ld.clone(await mountedOrig.status())).eql({ idSquared: 25 });
    });

    it("should error on invalid observer", async () => {
        const root = <BogusObserve />;
        const { mountedOrig } = await Adapt.build(root, null);
        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        return should(mountedOrig.status()).rejectedWith(/Cannot find observer doesNotExist/);
    });
});
