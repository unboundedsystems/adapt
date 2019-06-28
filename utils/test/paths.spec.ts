import * as path from "path";
import expect from "should";

import * as paths from "../src/paths";

// FIXME(mark): This assumes these tests always run in our containit
// container. May need to be generalized later.
const actualRepoRoot = "/src";

describe("Paths tests", () => {
    it("Should have correct repo root", () => {
        expect(paths.utilsDirs.repoRoot).equals(actualRepoRoot);
        expect(paths.repoRootDir).equals(actualRepoRoot);
    });

    it("Should have correct adapt package root", () => {
        expect(paths.repoDirs.core).equals(path.join(actualRepoRoot, "core"));
    });
    it("Should have correct utils dist", () => {
        expect(paths.utilsDirs.dist).equals(path.join(actualRepoRoot, "utils", "dist"));
    });
    it("Should have correct utils test", () => {
        expect(paths.utilsDirs.test).equals(path.join(actualRepoRoot, "utils", "test"));
    });
});
