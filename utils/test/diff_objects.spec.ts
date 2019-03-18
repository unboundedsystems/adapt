import should from "should";

import { diffObjects } from "../src/diff_objects";

describe("diffObjects", () => {
    it("Should diff arrays", () => {
        let diff = diffObjects([], ["one"]);
        should(diff).equal(`+ [0]: 'one'`);

        diff = diffObjects(["one"], []);
        should(diff).equal(`- [0]: 'one'`);

        diff = diffObjects(["one"], ["one"]);
        should(diff).equal("");

        diff = diffObjects(["one"], ["two"]);
        should(diff).equal(
`! [0]:
  - 'one'
  + 'two'`);

        diff = diffObjects(["one", "two"], ["two", "one"]);
        should(diff).equal(
`! [1]:
  - 'two'
  + 'one'
! [0]:
  - 'one'
  + 'two'`);
    });

    it("Should diff objects", () => {
        let diff = diffObjects({}, {one: true});
        should(diff).equal(`+ one: true`);

        diff = diffObjects({one: true}, {});
        should(diff).equal(`- one: true`);

        diff = diffObjects({one: true}, {one: true});
        should(diff).equal("");

        diff = diffObjects({}, {one: undefined});
        should(diff).equal(`+ one: undefined`);

        diff = diffObjects({one: true}, {one: false});
        should(diff).equal(
`! one:
  - true
  + false`);
    });

    it("Should diff undefined", () => {
        let diff = diffObjects(undefined, {});
        should(diff).equal(`+ CREATED: {}`);

        diff = diffObjects({}, undefined);
        should(diff).equal(`- DELETED: {}`);
    });

    it("Should indent multi-line objects", () => {
        // This breaks into multi-line when strinified obj > 60 chars
        const diff = diffObjects(undefined, {
            one: "A pretty darn long value",
            two: "Another, yet longer value for sure",
        });
        should(diff).equal(
`+ CREATED: { one: 'A pretty darn long value',
  +   two: 'Another, yet longer value for sure' }`);
    });
});
