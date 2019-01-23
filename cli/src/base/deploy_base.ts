import { flags } from "@oclif/command";
import { filePathToUrl, MessageClient, MessageLogger } from "@usys/utils";
import * as fs from "fs-extra";
import Listr = require("listr");
import * as path from "path";
import { ReplaceT } from "type-ops";
import { DeployState, DeploySuccess } from "../types/adapt_shared";
import { AdaptBase, createLoggerPair, defaultListrOptions, doLogging } from "./adapt_base";

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
    logger: MessageLogger;
    client: MessageClient;
    projectFile?: string;
    stackName?: string;

    // Created by tasks
    project?: Project;
}

export abstract class DeployBase extends AdaptBase {

    static flags = {
        serverUrl: flags.string({
            description: "URL of Adapt server. Defaults to using local system.",
            env: "ADAPT_SERVER_URL",
        }),
        rootFile: flags.string({
            description: "Project description file to deploy (.ts or .tsx)",
            default: "index.tsx",
        }),
    };

    args?: any;
    flags?: any;

    tasks = new Listr(defaultListrOptions);

    ctx: DeployCtx;

    async init() {
        await super.init();

        // tslint:disable-next-line:no-shadowed-variable
        const { args, flags } = this.parse();
        this.flags = flags;
        this.args = args;

        let adaptUrl: string;
        if (this.flags.serverUrl) {
            adaptUrl = this.flags.serverUrl;
        } else {
            const dbFile = path.join(this.config.dataDir, "local_deploy");
            adaptUrl = filePathToUrl(dbFile);
        }

        const pair = createLoggerPair("deploy", doLogging);
        this.ctx = {
            adaptUrl,
            debug: this.flags.debug,
            ...pair,
        };

        const projectFile = path.resolve(this.flags.rootFile);
        if (projectFile && await fs.pathExists(projectFile)) {
            this.ctx.projectFile = projectFile;
        }
    }
}

export abstract class DeployOpBase extends DeployBase {
    static flags = {
        ...DeployBase.flags,
        dryRun: flags.boolean({
            description: "Show what would happen during deploy, but do not modify the deployment",
        }),
        debug: flags.string({
            char: "d",
            description:
                "Enable additional debug output. Should be a comma-separated " +
                "list of debug flags. Valid debug flags are: build",
            default: "",
            helpValue: "debugFlags",
        }),
        registry: flags.string({
            description: "URL of alternate NPM registry to use",
            env: "ADAPT_NPM_REGISTRY",
        }),
    };

    ctx: ReplaceT<Required<DeployCtx>, { project?: Project }>;

    async init() {
        await super.init();

        const stackName: string = this.args.stackName;
        const cacheDir = path.join(this.config.cacheDir, "npmcache");

        if (this.flags.rootFile == null) throw new Error(`Internal error: rootFile cannot be null`);
        if (this.flags.dryRun === undefined) this.flags.dryRun = false;

        this.ctx = {
            ...this.ctx,
            dryRun: this.flags.dryRun,
            stackName,
        };

        this.tasks.add([
            {
                title: "Validating project",
                task: async () => {
                    if (! await fs.pathExists(this.ctx.projectFile)) {
                        this.error(`Project file '${this.flags.rootFile}' does not exist`);
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
                        if (this.flags.registry) projOpts.registry = this.flags.registry;
                        this.ctx.project = await load(projectRoot, projOpts);
                        const gen = getGen(this.ctx.project);
                        if (!gen.matchInfo.matches) {
                            this.error(cantDeploy +
                                `The following updates must be made:\n` +
                                gen.matchInfo.required.map(
                                    (ui) => "  " + ui.message).join("\n"));
                        }
                    } catch (err) {
                        if (err.code === "ENOPACKAGEJSON") {
                            this.error(cantDeploy +
                                `The directory '${projectRoot}' does not contain a ` +
                                `package.json file`);
                        }
                        throw err;
                    }
                },
            },
        ]);
    }

    isDeploySuccess(response: DeployState): response is DeploySuccess {
        return this.isApiSuccess(response, {
            errorMessage: cantDeploy,
            action: "deploy",
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
