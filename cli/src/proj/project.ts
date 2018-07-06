import * as fs from "fs-extra";
import * as pacote from "pacote";
import * as path from "path";

import * as npm from "../npm";
import { mkdtmp } from "../utils";
import { VersionString } from "./gen";

export interface Session {
    cacheDir: string;
    projectDir: string;
    remove?: () => void;
}

export interface ProjectOptions {
    session?: Session;
    progress?: boolean;
    loglevel?: npm.LogLevel;
}

const defaultOptions: ProjectOptions = {
    progress: true,
};

export async function load(projectSpec: string, projectOpts?: ProjectOptions) {
    const finalOpts = { ...defaultOptions, ...projectOpts };
    let removeSession = false;
    let session = finalOpts.session;

    if (!session) {
        session = await tempSession();
        removeSession = true;
    }
    const pacoteOpts = {
        cache: session.cacheDir,
    };
    const manifest = await pacote.manifest(projectSpec, pacoteOpts);
    await pacote.extract(projectSpec, session.projectDir, pacoteOpts);

    const npmOpts = {
        dir: session.projectDir,
        progress: finalOpts.progress,
        loglevel: finalOpts.loglevel,
        packageLockOnly: true,
    };
    await npm.install(npmOpts);

    const pkgLock = await npm.packageLock(session.projectDir);
    if (removeSession && session.remove) session.remove();

    return new Project(manifest, pkgLock, finalOpts);
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

export async function tempSession(): Promise<Session> {
    const dir = await mkdtmp("adapt-cli");
    const cacheDir = path.join(dir, "cache");
    const projectDir = path.join(dir, "project");
    await fs.ensureDir(cacheDir);
    await fs.ensureDir(projectDir);
    return {
        cacheDir,
        projectDir,
        remove: () => fs.removeSync(dir),
    };
}
