import * as fs from "fs-extra";
import * as pacote from "pacote";
import * as path from "path";

import { mkdtmp, ValidationError, withTmpDir, yarn } from "@usys/utils";
import { UserError } from "../error";
import {
    AdaptModule,
    CreateOptions,
    DeployState,
    StatusOptions,
    UpdateOptions,
    verifyAdaptModule,
    verifyDeployState,
} from "../types/adapt_shared";
import { VersionString } from "./gen";

export interface Session {
    cacheDir: string;
    projectDir: string;
    remove?: () => void;
}

export interface ProjectOptionsComplete {
    loglevel: yarn.LogLevel;
    progress: boolean;
    registry?: string;
    session: Session;
}

export type ProjectOptions = Partial<ProjectOptionsComplete>;

const defaultOptions = {
    loglevel: "normal" as yarn.LogLevel,
    progress: true,
};

async function finalProjectOptions(userOpts?: ProjectOptions): Promise<ProjectOptionsComplete> {
    let session = userOpts && userOpts.session;
    if (!session) session = await tempSession();
    session.projectDir = path.resolve(session.projectDir);
    return { ...defaultOptions, ...userOpts, session };
}

function yarnCommonOptions(
    projOpts: ProjectOptionsComplete, tmpModules?: string): yarn.CommonOptions {
    const yOpts: yarn.CommonOptions = {
        cwd: projOpts.session.projectDir,
        loglevel: projOpts.loglevel,
        noProgress: !projOpts.progress,
    };
    if (projOpts.registry) yOpts.registry = projOpts.registry;
    if (tmpModules) yOpts.modulesFolder = tmpModules;

    return yOpts;
}

function yarnInstallOptions(projOpts: ProjectOptionsComplete, tmpModules?: string): yarn.InstallOptions {
    const yOpts: yarn.InstallOptions = yarnCommonOptions(projOpts, tmpModules);
    return {
        ...yOpts,
        production: true,
        preferOffline: true,
    };
}

function yarnListOptions(projOpts: ProjectOptionsComplete, tmpModules?: string): yarn.ListParsedOptions {
    const yOpts: yarn.ListParsedOptions = yarnCommonOptions(projOpts, tmpModules);
    return {
        ...yOpts,
        production: true,
    };
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

    const tree = await withTmpDir(async (tmpModules) => {

        await yarn.install(yarnInstallOptions(finalOpts, tmpModules));
        return yarn.listParsed(yarnListOptions(finalOpts, tmpModules));

    }, { prefix: ".adapt-tmp-modules", basedir: session.projectDir });

    return new Project(manifest, tree, finalOpts);
}

export async function projectAdaptModule(projectRoot: string): Promise<AdaptModule> {
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
    private installed = false;
    constructor(readonly manifest: pacote.Manifest,
                readonly packageTree: yarn.ListTreeMods,
                readonly options: ProjectOptionsComplete) {
        this.name = manifest.name;
    }

    getLockedVersion(pkgName: string): VersionString | null {
        const mods = this.packageTree.get(pkgName);
        if (!mods) return null;
        const vList = Object.keys(mods.versions);
        if (vList.length > 1) {
            throw new Error(`More than one version of ${pkgName} installed`);
        }
        if (vList.length === 0) {
            throw new Error(`Data error - no version of ${pkgName} installed`);
        }
        return mods.versions[vList[0]].version;
    }

    async create(options: CreateOptions): Promise<DeployState> {
        return this.deploy(options, (adapt) => adapt.createDeployment(options));
    }

    async update(options: UpdateOptions): Promise<DeployState> {
        return this.deploy(options, (adapt) => adapt.updateDeployment(options));
    }

    async status(options: StatusOptions): Promise<DeployState> {
        return this.deploy(options, (adapt) => adapt.fetchStatus(options));
    }

    /**
     * NOTE: This function is purposely NOT async and returns the promise-like
     * execa ChildProcess object, NOT a promise to that object. That gives
     * the caller access to the output streams without having to wait for
     * completion of the yarn process.
     */
    installModules() {
        if (this.installed) return;
        const ret = yarn.install(yarnInstallOptions(this.options));
        ret.then(() => this.installed = true).catch();
        return ret;
    }

    private async deploy(options: CreateOptions | UpdateOptions, action: AdaptAction):
        Promise<DeployState> {
        if (!this.installed) {
            throw new Error(`Internal error: must call installModules before any deploy operation`);
        }
        const projectRoot = this.options.session.projectDir;

        options.fileName = path.resolve(projectRoot, options.fileName);
        options.projectRoot = projectRoot;

        const adapt = await projectAdaptModule(projectRoot);

        try {
            return verifyDeployState(await action(adapt));
        } catch (err) {
            if (err instanceof adapt.ProjectCompileError) {
                if (err.message) throw new UserError(err.message);

            } else if (err instanceof adapt.ProjectRunError) {
                if (err.message && err.projectStack) {
                    throw new UserError(`${err.message}\n${err.projectStack}`);
                }

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
