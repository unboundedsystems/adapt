import { Command, flags } from "@oclif/command";
import { filePathToUrl, getErrors, getWarnings } from "@usys/utils";
import * as fs from "fs-extra";
import Listr = require("listr");
import * as path from "path";
import { DeployError, DeploySuccess } from "../types/adapt_shared";

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
    dryRun: boolean;
    projectFile: string;
    stackName: string;

    // Created by tasks
    project?: Project;
}

export abstract class DeployBase extends Command {
    static flags = {
        debug: flags.string({
            char: "d",
            description:
                "Enable additional debug output. Should be a comma-separated " +
                "list of debug flags. Valid debug flags are: build",
            default: "",
            helpValue: "debugFlags",
        }),
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
    };

    args?: any;
    flags?: any;
    ctx?: DeployCtx;
    tasks = new Listr();
    finalOutput = "";

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
            const dbFile = path.join(this.config.dataDir, "local_deploy");
            adaptUrl = filePathToUrl(dbFile);
        }
        const ctx: DeployCtx = {
            adaptUrl,
            debug: flags.debug,
            dryRun: flags.dryRun,
            projectFile,
            stackName,
        };
        this.ctx = ctx;

        this.tasks.add([
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

    async finally(err?: Error) {
        await super.finally(err);
        if (err !== undefined) return;

        if (this.finalOutput !== "") this.log("\n" + this.finalOutput);
    }

    deployFailure(deployErr: DeployError) {
        const nwarn = deployErr.summary.warning;
        const warns = nwarn === 1 ? "warning" : "warnings";
        this.appendOutput(`${nwarn} ${warns} encountered during deploy:\n` +
            getWarnings(deployErr.messages));

        const nerr = deployErr.summary.error;
        const errors = nerr === 1 ? "error" : "errors";
        return this.error(
            cantDeploy +
            `${nerr} ${errors} encountered during deploy:\n` +
            getErrors(deployErr.messages));
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

    appendOutput(s: string) {
        this.finalOutput += s;
    }
}
