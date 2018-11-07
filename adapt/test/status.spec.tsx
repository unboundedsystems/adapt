import * as ld from "lodash";
import * as should from "should";
import Adapt, { BuildData, Component, gql, ObserveForStatus, PrimitiveComponent } from "../src";
import MockObserver from "../src/observers/MockObserver";
import { deepFilterElemsToPublic } from "./testlib";

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
        return <PrimitiveMockStatus key={this.props.key} />;
    }
}

class BogusObserve extends PrimitiveComponent<{}, {}> {
    async status(observe: ObserveForStatus<any>) {
        const obs = await observe({ observerName: "doesNotExist" }, gql`{ foo }`);
        return obs;
    }
}

// tslint:disable-next-line:variable-name
const MockSFC: Adapt.SFC<{}> = (props) => {
    return <PrimitiveMockStatus key={props.key} />;
};
MockSFC.status = async (props: {}, observe: ObserveForStatus<any>, buildData: BuildData) => {
    const obs = await observe(MockObserver, gql`{ mockById(id: 8) { idSquared } }`);
    if (!obs) return undefined;
    return obs.mockById;
    should(deepFilterElemsToPublic(buildData.successor)
        .eql(deepFilterElemsToPublic(MockSFC({} as any))));
};

describe("Observation for component status", () => {
    it("should allow primitive component to observe", async () => {
        const root = <PrimitiveMockStatus />;
        const { mountedOrig } = await Adapt.build(root, null);
        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        should(ld.clone(await mountedOrig.status())).eql({ idSquared: 100 });
    });

    it("should allow component to observe", async () => {
        const root = <MockStatus key="mock" />;
        const { mountedOrig } = await Adapt.build(root, null);
        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        should(ld.clone(await mountedOrig.status())).eql({ idSquared: 25 });

        const ref = deepFilterElemsToPublic(<PrimitiveMockStatus key="mock" />);
        should(deepFilterElemsToPublic(mountedOrig.buildData.successor)).eql(ref);
    });

    it("should allow SFC component to observe", async () => {
        const root = <MockSFC key="mock" />;
        const { mountedOrig } = await Adapt.build(root, null);
        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        should(ld.clone(await mountedOrig.status())).eql({ idSquared: 64 });

        const ref = deepFilterElemsToPublic(<PrimitiveMockStatus key="mock" />);
        should(deepFilterElemsToPublic(mountedOrig.buildData.successor)).eql(ref);
    });

    it("should error on invalid observer", async () => {
        const root = <BogusObserve />;
        const { mountedOrig } = await Adapt.build(root, null);
        if (mountedOrig === null) throw should(mountedOrig).not.Null();
        return should(mountedOrig.status()).rejectedWith(/Cannot find observer doesNotExist/);
    });
});
