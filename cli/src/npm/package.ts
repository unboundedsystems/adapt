import * as fs from "fs-extra";
import * as path from "path";

export interface PackageLock {
    name: string;
    version: string;
    lockfileVersion: number; // We only know about version 1
    requires: boolean;
    dependencies: Dependencies;
}
const requiredProps = [
    "name",
    "version",
    "lockfileVersion",
    "requires",
    "dependencies",
];

export interface Dependencies {
    [pkgName: string]: Dependency;
}

export interface Requires {
    [pkgName: string]: string;
}

export interface Dependency {
    version: string;
    resolved: string;
    integrity: string;
    bundled?: boolean;
    dev?: boolean;
    requires?: Requires;
    dependencies?: Dependencies;
}

const errMsg = "Error in format of package-lock.json file: ";

export async function packageLock(pkgRoot: string): Promise<PackageLock> {
    const json = await fs.readJson(path.join(pkgRoot, "package-lock.json"));
    for (const p of requiredProps) {
        if (json[p] == null) {
            throw new Error(errMsg + `required property ${p} missing`);
        }
    }
    if (json.lockfileVersion !== 1) {
        throw new Error(errMsg + `unrecognized version ${json.lockfileVersion}`);
    }
    return json;
}
