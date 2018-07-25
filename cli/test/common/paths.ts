import { findPackageDirs, sourceDir } from "@usys/utils";

export const packageDirs = findPackageDirs(__dirname);
export const pkgRootDir = packageDirs.root;
export const repoRootDir = packageDirs.repoRoot;

export {
    sourceDir,
};
