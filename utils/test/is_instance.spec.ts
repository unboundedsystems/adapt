import should from "should";
import { isInstance, tagConstructor, tagInstance } from "../src/is_instance";

describe("isInstance", () => {
    it("Should tag class constructors", () => {
        class One { x = 1; }
        class Two { x = 2; }
        tagConstructor(One);
        tagConstructor(Two);

        const inst1 = new One();
        const inst2 = new Two();

        should(isInstance(inst1, One)).be.True();
        should(isInstance(inst1, Two)).be.False();
        should(isInstance(inst2, Two)).be.True();
        should(isInstance(inst2, One)).be.False();
    });

    it("Should tag class instances", () => {
        class One { constructor() { tagInstance(this); } }
        class Two { constructor() { tagInstance(this); } }

        const inst1 = new One();
        const inst2 = new Two();

        should(isInstance(inst1, One)).be.True();
        should(isInstance(inst1, Two)).be.False();
        should(isInstance(inst2, Two)).be.True();
        should(isInstance(inst2, One)).be.False();
    });

    it("Should tag class expressions", () => {
        const one = class {};
        const two = class {};
        tagConstructor(one);
        tagConstructor(two);

        const inst1 = new one();
        const inst2 = new two();

        should(isInstance(inst1, one)).be.True();
        should(isInstance(inst1, two)).be.False();
        should(isInstance(inst2, two)).be.True();
        should(isInstance(inst2, one)).be.False();
    });

    it("Should disambiguate same name with scope", () => {
        // tslint:disable-next-line: no-shadowed-variable
        function a() { const one = class {}; tagConstructor(one, "scope1"); return one; }
        // tslint:disable-next-line: no-shadowed-variable
        function b() { const one = class {}; tagConstructor(one, "scope2"); return one; }
        const one = a();
        const two = b();

        // Both should be named the same function name.
        should(one.name).equal("one");
        should(two.name).equal("one");

        const inst1 = new one();
        const inst2 = new two();

        // isInstance calls now MUST be coupled with the appropriate scope
        should(isInstance(inst1, one, "scope1")).be.True();
        should(isInstance(inst1, two, "scope2")).be.False();
        should(isInstance(inst2, two, "scope2")).be.True();
        should(isInstance(inst2, one, "scope1")).be.False();
    });

    it("Should tag function constructors", () => {
        function One(this: any) { this.x = 1; }
        function Two(this: any) { this.x = 2; }
        tagConstructor(One);
        tagConstructor(Two);

        const inst1 = new (One as any)();
        const inst2 = new (Two as any)();

        should(isInstance(inst1, One)).be.True();
        should(isInstance(inst1, Two)).be.False();
        should(isInstance(inst2, Two)).be.True();
        should(isInstance(inst2, One)).be.False();
    });

    it("Should fail to tag a named lambda constructor", () => {
        const func = () => { /**/ };
        should(() => tagConstructor(func))
            .throwError(/tagConstructor cannot be used for function 'func'/);
    });

    it("Should fail to tag an anonymous function", () => {
        // tslint:disable-next-line: function-constructor
        const func = new Function();
        should(() => tagConstructor(func)).throwError(/Anonymous functions unsupported/);
    });
});
