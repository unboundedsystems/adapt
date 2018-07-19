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
    loglevel?: npm.LogLevel;
    progress?: boolean;
    registry?: string;
    session?: Session;
}

const defaultOptions: ProjectOptions = {
    loglevel: "warn",
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
    session.projectDir = path.resolve(session.projectDir);

    const pacoteOpts: pacote.Options = {
        cache: session.cacheDir,
    };
    if (finalOpts.registry) pacoteOpts.registry = finalOpts.registry;

    const manifest = await pacote.manifest(projectSpec, pacoteOpts);

    let inPlace = false;
    if (isLocal(projectSpec)) {
        projectSpec = path.resolve(projectSpec);
        if (projectSpec === session.projectDir) inPlace = true;
    }

    if (!inPlace) await pacote.extract(projectSpec, session.projectDir, pacoteOpts);

    const npmOpts: npm.InstallOptions = {
        cwd: session.projectDir,
        loglevel: finalOpts.loglevel,
        packageLockOnly: true,
        progress: finalOpts.progress,
    };
    if (finalOpts.registry) npmOpts.registry = finalOpts.registry;

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

function isLocal(filename: string) {
    return (filename.startsWith(".") || filename.startsWith("/"));
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
