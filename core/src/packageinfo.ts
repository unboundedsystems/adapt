import * as path from "path";
import * as readPkgUp from "read-pkg-up";

export interface PackageInfo {
    main: string;
    name: string;
    root: string;
    version: string;
}

export function findPackageInfo(dir: string): PackageInfo {
    const ret = readPkgUp.sync({cwd: dir, normalize: false });
    const pkgJson = ret.pkg;
    if (!pkgJson || !pkgJson.name || !pkgJson.version) {
        throw new Error(`Invalid plugin registration. Cannot find package.json info in directory ${dir}.`);
    }
    const root = path.dirname(ret.path);
    const main = path.resolve(path.join(root, pkgJson.main || "index.js"));
    return {
        main,
        name: pkgJson.name,
        root,
        version: pkgJson.version,
    };
}

/**
 * Traverse up the directory hierarchy from `dir` to find the parent of the
 * node_modules directory closest to root.
 * If no node_modules directory exists in the directory hierarchy, returns
 * undefined.
 */
export function findNodeModulesParent(dir: string): string | undefined {
    let lastParent: string | undefined;
    dir = path.resolve(dir);
    while (true) {
        const parsed = path.parse(dir);
        if (parsed.base === "node_modules") lastParent = parsed.dir;
        if (parsed.dir === dir) return lastParent;
        dir = parsed.dir;
    }
}
