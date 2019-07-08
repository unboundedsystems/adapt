import should from "should";
import { findNodeModulesParent } from "../src/packageinfo";

describe("findNodeModulesParent", () => {
    it("Should return parent", () => {
        should(findNodeModulesParent("/a/b/node_modules/")).equal("/a/b");
    });

    it("Should return undefined for root", () => {
        should(findNodeModulesParent("/")).be.Undefined();
    });

    it("Should return highest parent", () => {
        should(findNodeModulesParent("/a/node_modules/b/node_modules/c/d/node_modules/e/f")).equal("/a");
    });

    it("Should return highest parent if root", () => {
        should(findNodeModulesParent("/node_modules/b/node_modules/c/d/node_modules/e/f")).equal("/");
    });

    it("Should return undefined if node_modules not present", () => {
        should(findNodeModulesParent("/a/b/c/d/e")).be.Undefined();
    });

    it("Should normalize directory", () => {
        should(findNodeModulesParent("/a/b/node_modules/..")).be.Undefined();
    });
});
