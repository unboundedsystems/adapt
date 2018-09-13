import * as ld from "lodash";
import * as should from "should";
import { createObserverManagerDeployment, gql, Observer, ObserverManagerDeployment } from "../../src/observers";
import { modelData, TestObserver } from "./test_observer";

describe("Deployment Observer Manager Tests", () => {
    let mgr: ObserverManagerDeployment;

    beforeEach(() => {
        mgr = createObserverManagerDeployment();
    });

    it("Should instantiate", () => {
        //Nothing to do here
    });

    const query =
        gql`query Foo {
            fooById(id: "1") {
                id
                payload
            }
        }`;

    async function registerTestSchema(
        name: string = "test1",
        data?: typeof modelData,
        context = data) {

        const obs: Observer = new TestObserver();
        const schema = obs.schema;

        const observations = await obs.observe(schema, [query]);
        if (data !== undefined) {
            observations.data = data;
        }

        if (context !== undefined) {
            observations.context = context;
        }

        mgr.registerSchema(name, schema, observations);
    }

    it("Should register schema", async () => {
        await registerTestSchema();
    });

    it("Should prevent reregistration of schema", async () => {
        await registerTestSchema();
        return should(registerTestSchema()).rejectedWith(Error);
    });

    it("Should query schema", async () => {
        await registerTestSchema();

        const altData = ld.cloneDeep(modelData);
        altData.foos[1].payload = ["test2"];
        await registerTestSchema("test2", altData);

        const result1 = await mgr.executeQuery("test1", query);
        should(ld.cloneDeep(result1)).eql({ data: { fooById: { id: "1", payload: ["1", "2"] } } });

        const result2 = await mgr.executeQuery("test2", query);
        should(ld.cloneDeep(result2)).eql({ data: { fooById: { id: "1", payload: ["test2"] } } });
    });
});
