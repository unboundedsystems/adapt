import * as uutils from "@usys/utils";
import * as ld from "lodash";
import should from "should";
import { createObserverManagerDeployment, gql, ObserverManagerDeployment, ObserverPlugin } from "../../src/observers";
import MockObserver from "../../src/observers/MockObserver";
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

        const obs: ObserverPlugin = new TestObserver();
        const schema = obs.schema;

        const observations = await obs.observe([{ query }]);
        if (data !== undefined) {
            observations.data = data;
        }

        if (context !== undefined) {
            observations.context = context;
        }

        mgr.registerSchema({ observerName: name }, schema, observations);
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

        const result1 = await mgr.executeQuery({ observerName: "test1" }, query);
        should(ld.cloneDeep(result1)).eql({ data: { fooById: { id: "1", payload: ["1", "2"] } } });

        const result2 = await mgr.executeQuery({ observerName: "test2" }, query);
        should(ld.cloneDeep(result2)).eql({ data: { fooById: { id: "1", payload: ["test2"] } } });
    });

    it("Should record schema queries", async () => {
        await registerTestSchema();

        const query2 =
            gql`query Bar($id: ID!) {
            fooById(id: $id) {
                id
                payload
            }
        }`;

        should(mgr.executedQueries().test1.length).equal(0);

        const result1 = await mgr.executeQuery({ observerName: "test1" }, query);
        should(ld.cloneDeep(result1)).eql({ data: { fooById: { id: "1", payload: ["1", "2"] } } });

        const result2 = await mgr.executeQuery({ observerName: "test1" }, query2, { id: 2 });
        should(ld.cloneDeep(result2)).eql({ data: { fooById: { id: "2", payload: ["2", "3"] } } });

        const result3 = await mgr.executeQuery({ observerName: "test1" }, query2, { id: 3 });
        should(ld.cloneDeep(result3)).eql({ data: { fooById: { id: "3", payload: ["3", "4"] } } });

        //Repeat last result to make sure identical queries are collapsed.
        //not guaranteed in interface but is in current implementation if print(query) is identical.
        const result4 = await mgr.executeQuery({ observerName: "test1" }, query2, { id: 3 });
        should(ld.cloneDeep(result4)).eql({ data: { fooById: { id: "3", payload: ["3", "4"] } } });

        should(uutils.sortArray(mgr.executedQueries().test1)).eql([
            { query: query2, variables: { id: 2 } },
            { query: query2, variables: { id: 3 } },
            { query, variables: undefined },
        ]);
    });

    it("Should record queries that need data", async () => {
        await registerTestSchema();
        const lquery1 = gql`query { mockById(id: "1") { idSquared } }`;
        const lquery2 = gql`query { mockById(id: "1") { idPlusOne } }`;
        const observer = new MockObserver();
        mgr.registerSchema(MockObserver, observer.schema, {});

        await mgr.executeQuery(MockObserver, lquery1); // Needs data
        await mgr.executeQuery(MockObserver, lquery1); //query again to ensure that each query is recorded only once
        await mgr.executeQuery(MockObserver, lquery2); // Needs data
        await mgr.executeQuery({ observerName: "test1" }, query); //Does not need data

        const needsData = mgr.executedQueriesThatNeededData();
        const ref = {
            [MockObserver.observerName]: [
                { query: lquery1, variables: undefined },
                { query: lquery2, variables: undefined }
            ]
        };
        if (!uutils.isEqualUnorderedArrays(needsData, ref)) {
            should(needsData).eql(ref);
        }
    });
});
