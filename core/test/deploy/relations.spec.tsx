import { flatten } from "lodash";
import should from "should";
import { handle, Handle, Status } from "../../src";
import { Dependency, DeployHelpers, Relation, RelationOp } from "../../src/deploy/deploy_types";
import {
    relationInverse,
    relationIsReady,
    relationIsReadyStatus,
    relationToString,
    toDependencies,
} from "../../src/deploy/relation_utils";
import {
    AllOf,
    And,
    AnyOf,
    Edge,
    False,
    Identity,
    None,
    Not,
    Only,
    Or,
    True,
    Value,
} from "../../src/deploy/relations";
import { makeHandles } from "./common";

const inverse = relationInverse;
const ready = relationIsReady;
const toString = relationToString;

class MockDeployHelpers implements DeployHelpers {
    deployedMap = new Map<Dependency, boolean>();
    currentElem: Handle | null = null;

    elementStatus = <S extends Status = Status>(h: Handle): Promise<S | Status | undefined> => {
        throw new Error(`Not implemented in Mock yet`);
    }

    isDeployed = (dep: Dependency): boolean => {
        return this.deployedMap.get(dep) === true;
    }

    dependsOn = (hands: Handle | Handle[]): Relation => {
        const current = this.currentElem;
        if (current == null) throw new Error(`currentElem is null`);
        const toEdge = (h: Handle) => Edge(current, h, this.isDeployed);
        if (!Array.isArray(hands)) return toEdge(hands);
        return And(...hands.map(toEdge));
    }

    /*
     * Mock-specific
     */
    deployed(dep: Dependency, val = true) {
        this.deployedMap.set(dep, val);
    }
}

function makeInputs<T>(nInputs: number, values: T[]): T[][] {
    if (nInputs === 0) return [[]];
    const prev = makeInputs(nInputs - 1, values);
    let ret: T[][] = [];
    values.forEach((v) => {
        const appendVal = (x: T[]) => [v].concat(x);
        ret = ret.concat(prev.map(appendVal));
    });
    return ret;
}

function opTruthTable(relOp: RelationOp, argc: number): boolean[] {
    const args = makeInputs(argc, [False(), True()]);
    return args.map((list) => ready(relOp(...list)));
}

describe("Relations", () => {
    let helpers: MockDeployHelpers;

    beforeEach(() => {
        helpers = new MockDeployHelpers();
    });

    describe("AllOf", () => {
        it("Should be done when all dependencies are met", () => {
            const self = handle();
            const deps = makeHandles(4, "dep");

            helpers.currentElem = self;
            const a = AllOf(helpers, deps);
            helpers.currentElem = null;

            should(a.description).equal("all of");
            if (a.relatesTo == null) throw should(a.relatesTo).not.be.Undefined();
            should(flatten(a.relatesTo.map(toDependencies))).eql(deps);

            should(relationIsReadyStatus(a)).eql({
                done: false,
                status: "Waiting for 4 dependencies",
                related: deps.map((_h, i) => ({
                    done: false,
                    status: `Waiting for dependency Handle(dep${i})`
                }))
            });

            helpers.deployed(deps[3]);
            should(relationIsReadyStatus(a)).eql({
                done: false,
                status: "Waiting for 3 dependencies",
                related: [
                    { done: false, status: `Waiting for dependency Handle(dep0)` },
                    { done: false, status: `Waiting for dependency Handle(dep1)` },
                    { done: false, status: `Waiting for dependency Handle(dep2)` },
                ]
            });

            helpers.deployed(deps[0]);
            should(relationIsReadyStatus(a)).eql({
                done: false,
                status: "Waiting for 2 dependencies",
                related: [
                    { done: false, status: `Waiting for dependency Handle(dep1)` },
                    { done: false, status: `Waiting for dependency Handle(dep2)` },
                ]
            });

            helpers.deployed(deps[2]);
            should(relationIsReadyStatus(a)).eql({
                done: false,
                status: "Waiting for 1 dependency",
                related: [
                    { done: false, status: `Waiting for dependency Handle(dep1)` },
                ]
            });

            helpers.deployed(deps[1]);
            should(relationIsReadyStatus(a)).be.True();

            helpers.deployed(deps[2], false);
            should(relationIsReadyStatus(a)).eql({
                done: false,
                status: "Waiting for 1 dependency",
                related: [
                    { done: false, status: `Waiting for dependency Handle(dep2)` },
                ]
            });
        });

        it("Should be done with empty dependency list", () => {
            helpers.currentElem = handle();
            const a = AllOf(helpers, []);
            should(a.description).equal("all of");
            should(a.relatesTo).eql([]);
            should(relationIsReadyStatus(a)).be.True();
        });
    });

    describe("Only", () => {
        it("Should be done when dependency is met", () => {
            helpers.currentElem = handle();

            const dep = handle("onlydep");
            const a = Only(helpers, dep);
            should(a.description).equal("only");
            if (a.relatesTo == null) throw should(a.relatesTo).not.be.Undefined();
            should(flatten(a.relatesTo.map(toDependencies))).eql([dep]);

            should(relationIsReadyStatus(a)).eql({
                done: false,
                status: "Waiting for dependency Handle(onlydep)"
            });

            helpers.deployed(dep);
            should(relationIsReadyStatus(a)).be.True();

            helpers.deployed(dep, false);
            should(relationIsReadyStatus(a)).eql({
                done: false,
                status: "Waiting for dependency Handle(onlydep)"
            });
        });
    });

    describe("AnyOf", () => {
        it("Should be done when any dependency is met", () => {
            helpers.currentElem = handle();
            const deps = makeHandles(4, "any");

            const a = AnyOf(helpers, deps);
            should(a.description).equal("any of");
            if (a.relatesTo == null) throw should(a.relatesTo).not.be.Undefined();
            should(flatten(a.relatesTo.map(toDependencies))).eql(deps);

            should(relationIsReadyStatus(a)).eql({
                done: false,
                status: "Waiting for any of 4 dependencies",
                related: [
                    { done: false, status: `Waiting for dependency Handle(any0)` },
                    { done: false, status: `Waiting for dependency Handle(any1)` },
                    { done: false, status: `Waiting for dependency Handle(any2)` },
                    { done: false, status: `Waiting for dependency Handle(any3)` },
                ]
            });

            helpers.deployed(deps[3]);
            should(relationIsReadyStatus(a)).be.True();

            helpers.deployed(deps[0]);
            should(relationIsReadyStatus(a)).be.True();

            helpers.deployed(deps[2]);
            should(relationIsReadyStatus(a)).be.True();

            helpers.deployed(deps[1]);
            should(relationIsReadyStatus(a)).be.True();

            helpers.deployed(deps[0], false);
            helpers.deployed(deps[1], false);
            helpers.deployed(deps[2], false);
            helpers.deployed(deps[3], false);
            should(relationIsReadyStatus(a)).eql({
                done: false,
                status: "Waiting for any of 4 dependencies",
                related: [
                    { done: false, status: `Waiting for dependency Handle(any0)` },
                    { done: false, status: `Waiting for dependency Handle(any1)` },
                    { done: false, status: `Waiting for dependency Handle(any2)` },
                    { done: false, status: `Waiting for dependency Handle(any3)` },
                ]
            });
        });

        it("Should be done with empty dependency list", () => {
            helpers.currentElem = handle();
            const a = AnyOf(helpers, []);
            should(a.description).equal("any of");
            should(a.relatesTo).eql([]);
            should(relationIsReadyStatus(a)).be.True();
        });
    });

    describe("None", () => {
        it("Should be done", () => {
            const a = None();
            should(a.description).equal("none");
            should(a.relatesTo).be.Undefined();
            should(relationIsReadyStatus(a)).be.True();
        });
    });
});

describe("Basic Relation predicates", () => {
    it("Should construct a tree", () => {
        let r = True();
        should(ready(r)).be.True();
        should(toString(r)).equal("True()");

        r = Not(r);
        should(ready(r)).be.False();
        should(toString(r)).equal("Not(\n  True()\n)");

        r = Not(r);
        should(ready(r)).be.True();
        should(toString(r)).equal("Not(\n  Not(\n    True()\n  )\n)");

        r = Value(true, "Foo");
        should(ready(r)).be.True();
        should(toString(r)).equal("Foo(true)");

        r = Not(Value(() => false));
        should(ready(r)).be.True();
        should(toString(r)).equal("Not(\n  Value(<function>)\n)");
    });

    it("Should construct inverse", () => {
        let r = inverse(True());
        should(toString(r)).equal("True()");
        should(ready(r)).be.True();

        r = inverse(Not(True()));
        should(toString(r)).equal("Not(\n  True()\n)");
        should(ready(r)).be.False();
    });

    it("Should perform basic logic", () => {
        should(opTruthTable(Not, 1)).eql([true, false]);
        should(opTruthTable(Identity, 1)).eql([false, true]);
        should(opTruthTable(And, 2)).eql([false, false, false, true]);
        should(opTruthTable(Or, 2)).eql([false, true, true, true]);
    });

    it("Should allow variable arguments", () => {
        should(opTruthTable(And, 0)).eql([true]);
        should(opTruthTable(And, 1)).eql([false, true]);
        should(opTruthTable(Or, 0)).eql([true]);
        should(opTruthTable(Or, 1)).eql([false, true]);

        let table = opTruthTable(And, 10);
        should(table).have.length(2 ** 10);
        table.forEach((v, i) => should(v).equal(i === 1023 ? true : false));

        table = opTruthTable(Or, 10);
        should(table).have.length(2 ** 10);
        table.forEach((v, i) => should(v).equal(i === 0 ? false : true));
    });
});

describe("Relation Edge", () => {
    let helpers: MockDeployHelpers;

    beforeEach(() => {
        helpers = new MockDeployHelpers();
    });

    it("Should construct an Edge", () => {
        const deps = makeHandles(2);
        const e1 = Edge(deps[0], deps[1], helpers.isDeployed);
        should(toString(e1)).equal("Edge( Handle(0), Handle(1) )");
        should(toString(inverse(e1))).equal("Edge( Handle(1), Handle(0) )");
    });

    interface CheckDeployStatus {
        inputs: boolean[];
        output: boolean;
    }

    function checkDeployStatus(rel: Relation, deps: Handle[]): CheckDeployStatus[] {
        const allInputs = makeInputs(deps.length, [false, true]);

        return allInputs.map((inputs) => {
            deps.forEach((d, i) => helpers.deployed(d, inputs[i]));
            return {
                inputs,
                output: ready(rel)
            };
        });
    }

    const outputOnly = (ds: CheckDeployStatus) => ds.output;

    it("Should reflect deploy status", () => {
        const deps = makeHandles(2);
        const e1 = Edge(deps[0], deps[1], helpers.isDeployed);
        const inv = inverse(e1);

        // isDeployed: false, false
        should(ready(e1)).be.False();
        should(ready(inv)).be.False();

        // isDeployed: false, true
        helpers.deployed(deps[1], true);
        should(ready(e1)).be.True();
        should(ready(inv)).be.False();

        // isDeployed: true, false
        helpers.deployed(deps[0], true);
        helpers.deployed(deps[1], false);
        should(ready(e1)).be.False();
        should(ready(inv)).be.True();

        // isDeployed: true, true
        helpers.deployed(deps[1], true);
        should(ready(e1)).be.True();
        should(ready(inv)).be.True();
    });

    it("Should construct compound inverse", () => {
        const deps = makeHandles(3);
        const n1 = And(
            Edge(deps[0], deps[1], helpers.isDeployed),
            Edge(deps[0], deps[2], helpers.isDeployed));
        should(toString(n1)).equal(
            "And(\n  Edge( Handle(0), Handle(1) ),\n  Edge( Handle(0), Handle(2) )\n)");

        const inv = inverse(n1);
        should(toString(inv)).equal(
            "And(\n  Edge( Handle(1), Handle(0) ),\n  Edge( Handle(2), Handle(0) )\n)");
    });

    it("Should reflect 3 node deploy status: And", () => {
        // A depends on B and C
        const [ a, b, c ] = makeHandles(3);
        const aReady = And(
            Edge(a, b, helpers.isDeployed), // A depends on B
            Edge(a, c, helpers.isDeployed)  // A depends on C
        );
        const bDestroy = inverse(aReady);
        // Note: cDestroy === bDestroy

        // A is ready to Deploy only when both B and C are Deployed
        // deploy state of A doesn't matter.
        let status = checkDeployStatus(aReady, [a, b, c]).map(outputOnly);
        should(status).eql([
            false, false, false, true,
            false, false, false, true,
        ]);

        // B is ready to Destroy when A is Destroyed. Deploy state of
        // B and C don't matter.
        status = checkDeployStatus(bDestroy, [a, b, c]).map(outputOnly);
        should(status).eql([
            false, false, false, false,
            true, true, true, true,
        ]);
    });

    it("Should reflect 4 node deploy status: And", () => {
        // A depends on B and C
        // D depends on B and C
        const [ a, b, c, d ] = makeHandles(4);
        const aReady = And(
            Edge(a, b, helpers.isDeployed), // A depends on B
            Edge(a, c, helpers.isDeployed)  // A depends on C
        );
        const dReady = And(
            Edge(d, b, helpers.isDeployed), // D depends on B
            Edge(d, c, helpers.isDeployed)  // D depends on C
        );
        const bDestroy = And(inverse(aReady), inverse(dReady));
        // Note: cDestroy === bDestroy

        // A is ready to Deploy only when both B and C are Deployed
        // deploy state of A and D doesn't matter.
        let status = checkDeployStatus(aReady, [a, b, c, d]).map(outputOnly);
        should(status).eql([
            false, false, false, false,  // a=false, b=false
            false, false, true, true,    // a=false, b=true
            false, false, false, false,  // a=true,  b=false
            false, false, true, true,    // a=true,  b=true
        ]);

        // D is ready under same conditions as A
        status = checkDeployStatus(dReady, [a, b, c, d]).map(outputOnly);
        should(status).eql([
            false, false, false, false,  // a=false, b=false
            false, false, true, true,    // a=false, b=true
            false, false, false, false,  // a=true,  b=false
            false, false, true, true,    // a=true,  b=true
        ]);

        // B is ready to Destroy when A and D are Destroyed. Deploy state of
        // B and C don't matter.
        status = checkDeployStatus(bDestroy, [a, b, c, d]).map(outputOnly);
        should(status).eql([
            false, false, false, false,  // a=false, b=false
            false, false, false, false,  // a=false, b=true
            false, true, false, true,    // a=true,  b=false
            false, true, false, true,    // a=true,  b=true
        ]);
    });

    it("Should reflect 5 node deploy status: And", () => {
        // A depends on B and C
        // D depends on B and C
        // E depends on C
        const [ a, b, c, d, e ] = makeHandles(5);
        const aReady = And(
            Edge(a, b, helpers.isDeployed), // A depends on B
            Edge(a, c, helpers.isDeployed)  // A depends on C
        );
        const dReady = And(
            Edge(d, b, helpers.isDeployed), // D depends on B
            Edge(d, c, helpers.isDeployed)  // D depends on C
        );
        const eReady = Edge(e, c, helpers.isDeployed); // E depends on C

        // Destroy
        const bDestroy = And(inverse(aReady), inverse(dReady));
        const cDestroy = And(inverse(aReady), And(inverse(dReady), inverse(eReady)));
        // Note: cDestroy === bDestroy

        // A is ready to Deploy only when both B and C are Deployed
        // deploy state of A, D, and E doesn't matter.
        let status = checkDeployStatus(aReady, [a, b, c, d, e]).map(outputOnly);
        should(status).eql([
            false, false, false, false,  // a=false, b=false, c=false
            false, false, false, false,  // a=false, b=false, c=true
            false, false, false, false,  // a=false, b=true,  c=false
            true, true, true, true,      // a=false, b=true,  c=true
            false, false, false, false,  // a=true,  b=false, c=false
            false, false, false, false,  // a=true,  b=false, c=true
            false, false, false, false,  // a=true,  b=true,  c=false
            true, true, true, true,      // a=true,  b=true,  c=true
        ]);

        // D is ready under same conditions as A
        status = checkDeployStatus(dReady, [a, b, c, d, e]).map(outputOnly);
        should(status).eql([
            false, false, false, false,  // a=false, b=false, c=false
            false, false, false, false,  // a=false, b=false, c=true
            false, false, false, false,  // a=false, b=true,  c=false
            true, true, true, true,      // a=false, b=true,  c=true
            false, false, false, false,  // a=true,  b=false, c=false
            false, false, false, false,  // a=true,  b=false, c=true
            false, false, false, false,  // a=true,  b=true,  c=false
            true, true, true, true,      // a=true,  b=true,  c=true
        ]);

        // E is ready when C is Deployed
        status = checkDeployStatus(eReady, [a, b, c, d, e]).map(outputOnly);
        should(status).eql([
            false, false, false, false,  // a=false, b=false, c=false
            true, true, true, true,      // a=false, b=false, c=true
            false, false, false, false,  // a=false, b=true,  c=false
            true, true, true, true,      // a=false, b=true,  c=true
            false, false, false, false,  // a=true,  b=false, c=false
            true, true, true, true,      // a=true,  b=false, c=true
            false, false, false, false,  // a=true,  b=true,  c=false
            true, true, true, true,      // a=true,  b=true,  c=true
        ]);

        // B is ready to Destroy when A and D are Destroyed. Deploy state of
        // B and C don't matter.
        status = checkDeployStatus(bDestroy, [a, b, c, d, e]).map(outputOnly);
        should(status).eql([
            false, false, false, false,  // a=false, b=false, c=false
            false, false, false, false,  // a=false, b=false, c=true
            false, false, false, false,  // a=false, b=true,  c=false
            false, false, false, false,  // a=false, b=true,  c=true

            false, false, true, true,    // a=true,  b=false, c=false
            false, false, true, true,    // a=true,  b=false, c=true
            false, false, true, true,    // a=true,  b=true,  c=false
            false, false, true, true,    // a=true,  b=true,  c=true
        ]);

        // C is ready to Destroy when all of A, D, and E are Destroyed.
        // Deploy state of B and C don't matter.
        status = checkDeployStatus(cDestroy, [a, b, c, d, e]).map(outputOnly);
        should(status).eql([
            false, false, false, false,  // a=false, b=false, c=false
            false, false, false, false,  // a=false, b=false, c=true
            false, false, false, false,  // a=false, b=true,  c=false
            false, false, false, false,  // a=false, b=true,  c=true
            false, false, false, true,   // a=true,  b=false, c=false
            false, false, false, true,   // a=true,  b=false, c=true
            false, false, false, true,   // a=true,  b=true,  c=false
            false, false, false, true,   // a=true,  b=true,  c=true
        ]);
    });

    it("Should reflect 4 node deploy status: Or", () => {
        // A depends on B or C
        // D depends on B or C
        const [ a, b, c, d ] = makeHandles(4);
        const aReady = Or(
            Edge(a, b, helpers.isDeployed), // A depends on B
            Edge(a, c, helpers.isDeployed)  // A depends on C
        );
        const dReady = Or(
            Edge(d, b, helpers.isDeployed), // D depends on B
            Edge(d, c, helpers.isDeployed)  // D depends on C
        );
        const bDestroy = And(inverse(aReady), inverse(dReady));
        // Note: cDestroy === bDestroy

        // A is ready to Deploy when either B or C are Deployed
        // deploy state of A and D doesn't matter.
        let status = checkDeployStatus(aReady, [a, b, c, d]).map(outputOnly);
        should(status).eql([
            false, false, true, true,  // a=false, b=false
            true, true, true, true,    // a=false, b=true
            false, false, true, true,  // a=true,  b=false
            true, true, true, true,    // a=true,  b=true
        ]);

        // D is ready under same conditions as A
        status = checkDeployStatus(dReady, [a, b, c, d]).map(outputOnly);
        should(status).eql([
            false, false, true, true,  // a=false, b=false
            true, true, true, true,    // a=false, b=true
            false, false, true, true,  // a=true,  b=false
            true, true, true, true,    // a=true,  b=true
        ]);

        // B is ready to Destroy when A and D are Destroyed. Deploy state of
        // B and C don't matter.
        status = checkDeployStatus(bDestroy, [a, b, c, d]).map(outputOnly);
        should(status).eql([
            false, false, false, false,  // a=false, b=false
            false, false, false, false,  // a=false, b=true
            false, true, false, true,    // a=true,  b=false
            false, true, false, true,    // a=true,  b=true
        ]);
    });
});
