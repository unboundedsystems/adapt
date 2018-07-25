import * as path from "path";
import * as expect from "should";

import * as paths from "../src/paths";

// FIXME(mark): This assumes these tests always run in our containit
// container. May need to be generalized later.
const actualRepoRoot = "/src";

describe("Paths tests", () => {
    it("Should have correct repo root", () => {
        expect(paths.utilsDirs.repoRoot === actualRepoRoot);
        expect(paths.repoRootDir === actualRepoRoot);
    });

    it("Should have correct adapt package root", () => {
        expect(paths.repoDirs.adapt === path.join(actualRepoRoot, "adapt"));
    });
    it("Should have correct utils dist", () => {
        expect(paths.utilsDirs.dist === path.join(actualRepoRoot, "utils", "dist"));
    });
    it("Should have correct utils test", () => {
        expect(paths.repoDirs.adapt === path.join(actualRepoRoot, "utils", "test"));
    });
});
