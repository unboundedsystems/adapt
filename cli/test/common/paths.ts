import { findPackageDirs, sourceDir } from "@adpt/utils";

export const packageDirs = findPackageDirs(__dirname);
export const pkgRootDir = packageDirs.root;
export const repoRootDir = packageDirs.repoRoot;

export {
    sourceDir,
};
