/*
 * Copyright 2018-2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as fs from "fs-extra";
import * as pacote from "pacote";
import * as path from "path";

import { mkdtmp, ValidationError, yarn } from "@adpt/utils";
import { ExecaChildProcess } from "execa";
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
import { isLocal } from "../utils";
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

    return new Project(manifest, session.projectDir, finalOpts);
}

export async function projectAdaptModule(projectRoot: string): Promise<AdaptModule> {
    const entryFile = require.resolve("@adpt/core", { paths: [projectRoot]});

    // Load Adapt at runtime. We've already done some version
    // verification before getting here, but we don't
    // have types.
    // TODO(mark): What's the right way to type this? We actually
    // don't want to have a dependency on @adpt/core.

    // tslint:disable-next-line:no-implicit-dependencies
    return verifyAdaptModule(await require(entryFile));
}

type AdaptAction = (adapt: AdaptModule) => Promise<any>;

export class Project {
    readonly name: string;
    private installed = false;
    constructor(readonly manifest: pacote.Manifest,
                readonly projectDir: string,
                readonly options: ProjectOptionsComplete) {
        this.name = manifest.name;
    }

    getLockedVersion(pkgName: string): VersionString | null {
        if (!this.installed) {
            throw new Error(`Internal error: must call installModules before checking package versions`);
        }
        try {
            const pkgJsonPath = path.join(
                this.projectDir, "node_modules", pkgName, "package.json");
            const pkgJson = fs.readJsonSync(pkgJsonPath);
            const version = pkgJson.version;
            if (!version || typeof version !== "string") {
                throw new Error(`Version information for package ${pkgName} is invalid (${version})`);
            }
            return version;
        } catch (err) {
            return null;
        }
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
    installModules(): ExecaChildProcess<string> | undefined {
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
