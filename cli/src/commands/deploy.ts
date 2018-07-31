import { Command, flags } from "@oclif/command";
import { filePathToUrl } from "@usys/utils";
import * as fs from "fs-extra";
import Listr = require("listr");
import * as path from "path";

import {
    createStateHistoryDir,
    getGen,
    load,
    Project,
    ProjectOptions,
    Session,
    StateHistory,
} from "../proj";
import { BuildOptions, BuildState } from "../types/adapt_shared";

const cantBuild = "This project cannot be deployed.\n";

export const defaultStateHistoryDir = "./state_history";

export default class DeployCommand extends Command {
    static description = "Deploy an Adapt project";

    static examples = [
        `
  Deploy the stack named "dev" from the default project description file, index.tsx:
    $ adapt deploy dev

  Deploy the stack named "dev" from an alternate description file:
    $ adapt deploy --rootFile somefile.tsx dev
`,
    ];

    static flags = {
        deployID: flags.string({
            description: "Identifier for the deployment or 'new' for a new deployment",
            default: "new",
        }),
        dryRun: flags.boolean({
            description: "Show what would happen during deploy, but do not modify the deployment",
        }),
        init: flags.boolean({
            description: "Initialize a new state history directory if it doesn't exist",
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

    static args = [
        {
            name: "stackName",
            required: true,
        },
    ];

    async run() {
        // tslint:disable-next-line:no-shadowed-variable
        const { args, flags } = this.parse(DeployCommand);
        const { stackName } = args;
        const cacheDir = path.join(this.config.cacheDir, "npmcache");

        if (flags.rootFile == null) throw new Error(`Internal error: rootFile cannot be null`);

        // NOTE(mark): Why doesn't oclif set the boolean flags to false?
        if (flags.init === undefined) flags.init = false;
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

        // Task context items
        // NOTE: TypeScript 2.9 has trouble doing control flow analysis when
        // assignments to these occur in callbacks, like below. Workaround
        // is adding undefined to the types and NOT initializing them.
        // See: https://github.com/Microsoft/TypeScript/issues/24445 and
        // https://github.com/Microsoft/TypeScript/issues/11498
        let project: Project | undefined;
        let history: StateHistory | undefined;
        let initialStateJson: string | undefined;

        const tasks = new Listr([
            {
                title: "Opening state history",
                task: async () => {
                    if (flags.stateHistory == null) {
                        throw new Error(`Internal error: stateHistory cannot be null`);
                    }
                    history = await createStateHistoryDir(flags.stateHistory, flags.init);

                    const stored = await history.lastState();
                    initialStateJson = stored.stateJson;
                },
            },
            {
                title: "Validating project",
                task: async () => {
                    try {
                        project = await load(projectRoot, projOpts);
                        const gen = getGen(project);
                        if (!gen.matchInfo.matches) {
                            this.error(cantBuild +
                                `The following updates must be made:\n` +
                                gen.matchInfo.required.map(
                                    (ui) => "  " + ui.message).join("\n"));
                        }
                    } catch (err) {
                        if (err.code === "ENOPACKAGEJSON") {
                            this.error(cantBuild +
                                `The directory '${projectRoot}' does not contain a ` +
                                `package.json file`);
                        }
                        throw err;
                    }
                },
            },
            {
                title: "Deploying project",
                task: async () => {
                    if (project == null) {
                        throw new Error(`Internal error: project cannot be null`);
                    }
                    if (history == null) {
                        throw new Error(`Internal error: history cannot be null`);
                    }
                    if (initialStateJson == null) {
                        throw new Error(`Internal error: initState cannot be null`);
                    }
                    if (flags.deployID == null) {
                        throw new Error(`Internal error: deployID cannot be null`);
                    }
                    const buildOptions: BuildOptions = {
                        adaptUrl,
                        fileName: projectFile,
                        initialStateJson,
                        projectName: project.name,
                        deployID: flags.deployID,
                        stackName,
                        dryRun: flags.dryRun,
                        initLocalServer: true,
                    };
                    let buildState: BuildState;
                    try {
                        buildState = await project.build(buildOptions);
                    } catch (err) {
                        if (err.message.match(/No plugins registered/)) {
                            this.error(cantBuild +
                                `The project did not import any Adapt plugins`);
                        }
                        throw err;
                    }

                    await history.appendState(buildState);

                    const id = buildState.deployId;
                    if (id == null) this.error(`Deploy successful, but deployID missing in response.`);

                    if (flags.deployID === "new") {
                        this.log(`Deployment created successfully. DeployID is: ${id}`);
                    } else {
                        this.log(`Deployment ${id} updated successfully.`);
                    }
                }
            }
        ]);

        try {
            await tasks.run();
        } catch (err) {
            try {
                if (history != null) await history.revert();
            } catch (e2) {
                this.warn(e2);
            }
            this.error(err);
        }
    }

}
