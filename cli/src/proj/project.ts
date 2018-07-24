import * as fs from "fs-extra";
import * as pacote from "pacote";
import * as path from "path";

import * as npm from "../npm";
import {
    ValidationError,
    verifyAdaptModule,
    verifyBuildState,
} from "../types/adapt_shared";
import { mkdtmp } from "../utils";
import { VersionString } from "./gen";

export interface Session {
    cacheDir: string;
    projectDir: string;
    remove?: () => void;
}

export interface ProjectOptionsComplete {
    loglevel: npm.LogLevel;
    progress: boolean;
    registry?: string;
    session: Session;
}

export type ProjectOptions = Partial<ProjectOptionsComplete>;

const defaultOptions = {
    loglevel: "warn" as npm.LogLevel,
    progress: true,
};

async function finalProjectOptions(userOpts?: ProjectOptions): Promise<ProjectOptionsComplete> {
    let session = userOpts && userOpts.session;
    if (!session) session = await tempSession();
    session.projectDir = path.resolve(session.projectDir);
    return { ...defaultOptions, ...userOpts, session };
}

function npmInstallOptions(projOpts: ProjectOptionsComplete): npm.InstallOptions {
    const npmOpts: npm.InstallOptions = {
        cwd: projOpts.session.projectDir,
        loglevel: projOpts.loglevel,
        progress: projOpts.progress,
    };
    if (projOpts.registry) npmOpts.registry = projOpts.registry;

    return npmOpts;
}

function prependPath(oldPath: string | undefined, newDir: string): string {
    if (typeof oldPath === "string" && oldPath.length > 0) {
        return `${newDir}:${oldPath}`;
    }
    return newDir;
}

export async function load(projectSpec: string, projectOpts?: ProjectOptions) {
    const finalOpts = await finalProjectOptions(projectOpts);
    const session = finalOpts.session;

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

    const npmOpts = npmInstallOptions(finalOpts);
    npmOpts.packageLockOnly = true; // Don't actually install

    await npm.install(npmOpts);

    const pkgLock = await npm.packageLock(session.projectDir);

    return new Project(manifest, pkgLock, finalOpts);
}

export class Project {
    constructor(readonly manifest: pacote.Manifest,
                readonly packageLock: npm.PackageLock,
                readonly options: ProjectOptionsComplete) {
    }

    getLockedVersion(pkgName: string): VersionString | null {
        const dep = this.packageLock.dependencies[pkgName];
        return dep ? dep.version : null;
    }

    async build(rootFile: string, stackName: string, stateInputJson: string) {
        const projectDir = this.options.session.projectDir;

        await npm.install(npmInstallOptions(this.options));

        rootFile = path.resolve(projectDir, rootFile);

        const oldNodePath = process.env.NODE_PATH;
        try {
            // Only affects current process; not exported
            process.env.NODE_PATH = prependPath(oldNodePath, projectDir);

            // Load Adapt at runtime. We've already done some version
            // verification before getting here, but we don't
            // have types.
            // TODO(mark): What's the right way to type this? We actually
            // don't want to have a dependency on @usys/adapt.

            // tslint:disable-next-line:no-implicit-dependencies
            const adapt = verifyAdaptModule(await require("@usys/adapt"));

            try {
                return verifyBuildState(
                    adapt.buildStack(rootFile, stackName, stateInputJson,
                                     { rootDir: projectDir }));
            } catch (err) {
                if (err instanceof adapt.CompileError) {
                    // tslint:disable-next-line:no-console
                    console.log(`Got a compile error:\n`, err);
                } else if (err instanceof ValidationError) {
                    throw new Error(`Internal error: unrecognized response ` +
                        `from Adapt build: ${err.message}`);
                }
                throw err;
            }

        } finally {
            if (oldNodePath === undefined) delete process.env.NODE_PATH;
            else process.env.NODE_PATH = oldNodePath;
        }
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
