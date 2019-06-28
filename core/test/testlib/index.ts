import { findPackageDirs } from "@adpt/utils";

export * from "./components";
export * from "./deploy_mocks";
export * from "./do_build";
export * from "./server_mocks";

export { deepFilterElemsToPublic } from "../../src";
export const packageDirs = findPackageDirs(__dirname);
export const pkgRootDir = packageDirs.root;
export const pkgTestDir = packageDirs.test;
