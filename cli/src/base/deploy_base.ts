import { Command, flags } from "@oclif/command";
import { filePathToUrl } from "@usys/utils";
import * as fs from "fs-extra";
import Listr = require("listr");
import * as path from "path";
import { DeployError } from "../types/adapt_shared";
import { getErrors, getWarnings } from "../utils";

import {
    createStateHistoryDir,
    getGen,
    HistoryEntry,
    load,
    Project,
    ProjectOptions,
    Session,
    StateHistory,
} from "../proj";

export const cantDeploy = "This project cannot be deployed.\n";

export const defaultStateHistoryDir = "./state_history";

export interface DeployCtx {
    // Provided by init
    adaptUrl: string;
    dryRun: boolean;
    projectFile: string;
    stackName: string;

    // Created by tasks
    history?: StateHistory;
    lastState?: HistoryEntry;
    project?: Project;
}

export abstract class DeployBase extends Command {
    static flags = {
        dryRun: flags.boolean({
            description: "Show what would happen during deploy, but do not modify the deployment",
        }),
        registry: flags.string({
            description: "URL of alternate NPM registry to use",
            env: "ADAPT_NPM_REGISTRY",
        }),
        rootFile: flags.string({
            description: "Project description file to deploy (.ts or .tsx)",
            default: "index.tsx",
        }),
        serverUrl: flags.string({
            description: "URL of Adapt server. Defaults to using local system.",
            env: "ADAPT_SERVER_URL",
        }),
        stateHistory: flags.string({
            description: "Directory where state sequences will be stored",
            default: defaultStateHistoryDir,
        }),
    };

    args?: any;
    flags?: any;
    ctx?: DeployCtx;
    tasks = new Listr();

    async init() {
        await super.init();

        // tslint:disable-next-line:no-shadowed-variable
        const { args, flags } = this.parse();
        this.flags = flags;
        this.args = args;

        const stackName: string = args.stackName;

        const cacheDir = path.join(this.config.cacheDir, "npmcache");

        if (flags.rootFile == null) throw new Error(`Internal error: rootFile cannot be null`);

        if (flags.dryRun === undefined) flags.dryRun = false;

        const projectFile = path.resolve(flags.rootFile);

        if (! await fs.pathExists(projectFile)) {
            this.error(`Project file '${flags.rootFile}' does not exist`);
        }
        const projectRoot = path.dirname(projectFile);

        await fs.ensureDir(cacheDir);

        const session: Session = {
            cacheDir,
            projectDir: projectRoot,
        };
        const projOpts: ProjectOptions = {
            session,
        };

        if (flags.registry) projOpts.registry = flags.registry;

        let adaptUrl: string;
        if (flags.serverUrl) {
            adaptUrl = flags.serverUrl;
        } else {
            const dbFile = path.join(this.config.dataDir, "local_deploy.json");
            adaptUrl = filePathToUrl(dbFile);
        }
        const ctx: DeployCtx = {
            adaptUrl,
            dryRun: flags.dryRun,
            projectFile,
            stackName,
        };
        this.ctx = ctx;

        this.tasks.add([
            {
                title: "Opening state history",
                task: async () => {
                    if (flags.stateHistory == null) {
                        throw new Error(`Internal error: stateHistory cannot be null`);
                    }
                    ctx.history = await createStateHistoryDir(flags.stateHistory, flags.init);

                    ctx.lastState = await ctx.history.lastState();
                },
            },
            {
                title: "Validating project",
                task: async () => {
                    try {
                        ctx.project = await load(projectRoot, projOpts);
                        const gen = getGen(ctx.project);
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

    async catch(err: any): Promise<any> {
        const history = this.ctx && this.ctx.history;
        if (history) {
            try {
                await history.revert();
            } catch (e2) {
                this.warn(e2);
            }
        }
        return super.catch(err);
    }

    deployFailure(deployErr: DeployError) {
        const nwarn = deployErr.summary.warning;
        const warns = nwarn === 1 ? "warning" : "warnings";
        this.log(`${nwarn} ${warns} encountered during deploy:\n` +
            getWarnings(deployErr.messages));

        const nerr = deployErr.summary.error;
        const errors = nerr === 1 ? "error" : "errors";
        return this.error(
            cantDeploy +
            `${nerr} ${errors} encountered during deploy:\n` +
            getErrors(deployErr.messages));
    }
}
