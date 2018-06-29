import * as fs from "fs-extra";
import * as os from "os";
import * as pacote from "pacote";
import * as path from "path";

import * as npm from "../npm";
import { VersionString } from "./gen";

// tslint:disable-next-line:no-var-requires
const onExit = require("signal-exit");

export interface ProjectOptions {
    cacheDir?: string;
    progress?: boolean;
    loglevel?: npm.LogLevel;
}

const defaultOptions: ProjectOptions = {
    progress: true,
};

export async function load(projectSpec: string, projectOpts?: ProjectOptions) {
    const finalOpts = { ...defaultOptions, ...projectOpts };
    if (!finalOpts.cacheDir) {
        finalOpts.cacheDir = await mkdtmp("adapt-cli-cache");
    }
    const pacoteOpts = {
        cache: finalOpts.cacheDir,
    };
    const manifest = await pacote.manifest(projectSpec, pacoteOpts);
    const extDir = await mkdtmp("adapt-cli-extract");
    await pacote.extract(projectSpec, extDir, pacoteOpts);

    const npmOpts = {
        dir: extDir,
        progress: finalOpts.progress,
        loglevel: finalOpts.loglevel,
        packageLockOnly: true,
    };
    await npm.install(npmOpts);

    const pkgLock = await npm.packageLock(extDir);
    await fs.remove(extDir);

    return new Project(manifest, pkgLock, finalOpts);
}

async function mkdtmp(prefix: string): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), prefix + "-"))
        .then((newDir) => {
            onExit(() => fs.removeSync(newDir));
            return newDir;
        });
}

export class Project {
    constructor(public manifest: pacote.Manifest,
                public packageLock: npm.PackageLock,
                public options: ProjectOptions) {
    }

    getLockedVersion(pkgName: string): VersionString | null {
        const dep = this.packageLock.dependencies[pkgName];
        return dep ? dep.version : null;
    }

}
