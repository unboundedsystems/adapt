import * as fs from "fs-extra";
import * as pacote from "pacote";
import * as path from "path";

import { npm } from "@usys/utils";
import {
    AdaptModule,
    CreateOptions,
    DeployState,
    UpdateOptions,
    ValidationError,
    verifyAdaptModule,
    verifyDeployState,
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

// FIXME(mark): Move this to another file
async function adaptModule(projectRoot: string): Promise<AdaptModule> {
    const entryFile = require.resolve("@usys/adapt", { paths: [projectRoot]});

    // Load Adapt at runtime. We've already done some version
    // verification before getting here, but we don't
    // have types.
    // TODO(mark): What's the right way to type this? We actually
    // don't want to have a dependency on @usys/adapt.

    // tslint:disable-next-line:no-implicit-dependencies
    return verifyAdaptModule(await require(entryFile));
}

type AdaptAction = (adapt: AdaptModule) => Promise<any>;

export class Project {
    readonly name: string;
    constructor(readonly manifest: pacote.Manifest,
                readonly packageLock: npm.PackageLock,
                readonly options: ProjectOptionsComplete) {
        this.name = manifest.name;
    }

    getLockedVersion(pkgName: string): VersionString | null {
        const dep = this.packageLock.dependencies[pkgName];
        return dep ? dep.version : null;
    }

    async create(options: CreateOptions): Promise<DeployState> {
        return this.deploy(options, (adapt) => adapt.createDeployment(options));
    }

    async update(options: UpdateOptions): Promise<DeployState> {
        return this.deploy(options, (adapt) => adapt.updateDeployment(options));
    }

    private async deploy(options: CreateOptions | UpdateOptions, action: AdaptAction):
        Promise<DeployState> {
        const projectRoot = this.options.session.projectDir;

        await npm.install(npmInstallOptions(this.options));

        options.fileName = path.resolve(projectRoot, options.fileName);
        options.projectRoot = projectRoot;

        const adapt = await adaptModule(projectRoot);

        try {
            return verifyDeployState(await action(adapt));
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
