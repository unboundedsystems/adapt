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
