import * as fs from "fs-extra";
import * as path from "path";

const templatePackageJson = {
    version: "1.0.0",
    license: "UNLICENSED",
    dependencies: {},
};

export interface PkgJson {
    name: string;
    dependencies?: { [name: string]: string };
    [key: string]: string | object | undefined;
}

export interface Package {
    pkgJson: PkgJson;
    // value string is file contents
    files?: { [ filePath: string ]: string };
    // value string is a path to source file to copy
    copy?: { [ filePath: string ]: string };
}

async function writePackageJson(dir: string, overrides: PkgJson) {
    const contents = { ...templatePackageJson, ...overrides };
    await fs.outputJson(path.join(dir, "package.json"), contents, { spaces: 2 });
}

export async function writePackage(dir: string, pkg: Package) {
    await writePackageJson(dir, pkg.pkgJson);

    if (pkg.files) {
        for (const f of Object.keys(pkg.files)) {
            await fs.outputFile(path.join(dir, f), pkg.files[f]);
        }
    }
    if (pkg.copy) {
        for (const f of Object.keys(pkg.copy)) {
            await fs.copy(pkg.copy[f], path.join(dir, f));
        }
    }
}
