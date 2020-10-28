/*
 * Copyright 2018-2020 Unbounded Systems, LLC
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

import { MessageClient, MessageLogger } from "@adpt/utils";
import { flags } from "@oclif/command";
import Listr from "@unboundedsystems/listr";
import * as fs from "fs-extra";
import * as path from "path";
import { ReplaceT } from "type-ops";
import { DeployState, DeploySuccess } from "../types/adapt_shared";
import { taskObservable } from "../ui";
import { AdaptBase, createLoggerPair, defaultServerUrl, HandleResponseOptions } from "./adapt_base";

import {
    getGen,
    load,
    Project,
    ProjectOptions,
    Session,
} from "../proj";

export const cantDeploy = "This project cannot be deployed.\n";

export interface DeployCtx {
    // Provided by init
    adaptUrl: string;
    debug: string;
    dryRun?: boolean;
    force?: boolean;
    logger: MessageLogger;
    client: MessageClient;
    projectFile?: string;
    stackName?: string;

    // Created by tasks
    project?: Project;
}

export abstract class DeployBase extends AdaptBase {

    static flags = {
        ...AdaptBase.flags,
        debug: flags.string({
            char: "d",
            description:
                "Enable additional debug output. Should be a comma-separated " +
                "list of debug flags. Valid debug flags are: build",
            default: "",
            helpValue: "debugFlags",
        }),
        serverUrl: flags.string({
            description: "URL of Adapt server. Defaults to using local system.",
            env: "ADAPT_SERVER_URL",
        }),
        rootFile: flags.string({
            description: "Project description file to deploy (.ts or .tsx)",
            default: "index.tsx",
        }),
    };

    ctx: DeployCtx;
    tasks_?: Listr;

    get tasks(): Listr {
        if (!this.tasks_) throw new Error(`Internal error: cannot access tasks before init`);
        return this.tasks_;
    }

    async init() {
        await super.init();

        this.parse();
        const f = this.flags(DeployBase);

        this.tasks_ = new Listr(this.outputSettings.listrOptions);

        const adaptUrl = f.serverUrl || defaultServerUrl(this.config);

        const pair = createLoggerPair("deploy", this.outputSettings.logging);
        this.ctx = {
            adaptUrl,
            debug: f.debug || "",
            ...pair,
        };

        if (f.rootFile) {
            const projectFile = path.resolve(f.rootFile);
            if (await fs.pathExists(projectFile)) {
                this.ctx.projectFile = projectFile;
            }
        }
    }
}

export abstract class DeployOpBase extends DeployBase {
    static flags = {
        ...DeployBase.flags,
        dryRun: flags.boolean({
            description: "Show what would happen during deploy, but do not modify the deployment",
        }),
        registry: flags.string({
            description: "URL of alternate NPM registry to use",
            env: "ADAPT_NPM_REGISTRY",
        }),
    };

    ctx: ReplaceT<Required<DeployCtx>, {
        project?: Project;
        stackName?: string;
    }>;

    async init() {
        await super.init();

        const stackName: string = this.args.stackName;
        const cacheDir = path.join(this.config.cacheDir, "npmcache");
        const { rootFile, dryRun = false, registry } = this.flags(DeployOpBase);

        if (rootFile == null) throw new Error(`Internal error: rootFile cannot be null`);

        this.ctx = {
            ...this.ctx,
            dryRun,
            stackName,
        };

        this.tasks.add([
            {
                title: "Installing node modules",
                task: async () => {
                    if (! await fs.pathExists(this.ctx.projectFile)) {
                        this.error(`Project file '${rootFile}' does not exist`);
                    }
                    const projectRoot = path.dirname(this.ctx.projectFile);

                    await fs.ensureDir(cacheDir);

                    const session: Session = {
                        cacheDir,
                        projectDir: projectRoot,
                    };
                    const projOpts: ProjectOptions = {
                        session,
                    };

                    try {
                        if (registry) projOpts.registry = registry;
                        this.ctx.project = await load(projectRoot, projOpts);
                    } catch (err) {
                        if (err.code === "ENOPACKAGEJSON") {
                            this.error(cantDeploy +
                                `The directory '${projectRoot}' does not contain a ` +
                                `package.json file`);
                        }
                        throw err;
                    }

                    const ret = this.ctx.project.installModules();
                    if (!ret) return;
                    return taskObservable(ret.stdout, ret);
                }
            },
            {
                title: "Validating project",
                task: async () => {
                    const project = this.ctx.project;
                    if (project == null) {
                        throw new Error(`Internal error: project is null`);
                    }

                    const gen = getGen(project);
                    if (!gen.matchInfo.matches) {
                        this.error(cantDeploy +
                            `The following updates must be made:\n` +
                            gen.matchInfo.required.map(
                                (ui) => "  " + ui.message).join("\n"));
                    }
                }
            }
        ]);
    }

    isDeploySuccess(response: DeployState, options: HandleResponseOptions = {}): response is DeploySuccess {
        return this.isApiSuccess(response, {
            errorStart: cantDeploy,
            action: "deploy",
            ...options,
        });
    }

    deployInformation(deployStatus: DeploySuccess) {
        const needsData: string[] = [];
        for (const observerName in deployStatus.needsData) {
            if (!Object.hasOwnProperty.call(deployStatus.needsData, observerName)) continue;
            const queries = deployStatus.needsData[observerName];
            const queryMsgs = queries.map((q) =>
                `    ${q.query} ${q.variables ? "//" + JSON.stringify(q.variables) : ""}`).join("\n");
            needsData.push(
                `Observer '${observerName}' still needs data for these queries:\n${queryMsgs}`);
        }

        if (needsData.length > 0) {
            this.appendOutput(needsData.join("\n\n"));
        }
    }
}
