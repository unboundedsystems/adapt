import { Command, flags } from "@oclif/command";
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
        registry: flags.string({
            description: "URL of alternate NPM registry to use",
            env: "ADAPT_NPM_REGISTRY",
        }),
        rootFile: flags.string({
            description: "Project description file to deploy (.ts or .tsx)",
            default: "index.tsx",
        }),
        stateHistory: flags.string({
            description: "Directory where state sequences will be stored",
            default: defaultStateHistoryDir,
        }),
        init: flags.boolean({
            description: "Initialize a new state history directory if it doesn't exist",
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
        // NOTE(mark): Why doesn't oclif set the boolean to false?
        if (flags.init === undefined) flags.init = false;

        const projectFile = path.resolve(flags.rootFile);

        if (! await fs.pathExists(projectFile)) {
            this.error(`Project file '${flags.rootFile}' does not exist`);
        }
        const projectDir = path.dirname(projectFile);

        await fs.ensureDir(cacheDir);

        const session: Session = {
            cacheDir,
            projectDir,
        };
        const projOpts: ProjectOptions = {
            session,
        };

        if (flags.registry) projOpts.registry = flags.registry;

        // Task context items
        // NOTE: TypeScript 2.9 has trouble doing control flow analysis when
        // assignments to these occur in callbacks, like below. Workaround
        // is adding undefined to the types and NOT initializing them.
        // See: https://github.com/Microsoft/TypeScript/issues/24445 and
        // https://github.com/Microsoft/TypeScript/issues/11498
        let project: Project | undefined;
        let history: StateHistory | undefined;
        let initState: string | undefined;

        const tasks = new Listr([
            {
                title: "Opening state history",
                task: async () => {
                    if (flags.stateHistory == null) {
                        throw new Error(`Internal error: stateHistory cannot be null`);
                    }
                    history = await createStateHistoryDir(flags.stateHistory, flags.init);

                    const stored = await history.lastState();
                    initState = stored.stateJson;
                },
            },
            {
                title: "Validating project",
                task: async () => {
                    try {
                        project = await load(projectDir, projOpts);
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
                                `The directory '${projectDir}' does not contain a ` +
                                `package.json file`);
                        }
                        throw err;
                    }
                },
            },
            {
                title: "Building project",
                task: async () => {
                    if (project == null) {
                        throw new Error(`Internal error: project cannot be null`);
                    }
                    if (history == null) {
                        throw new Error(`Internal error: history cannot be null`);
                    }
                    if (initState == null) {
                        throw new Error(`Internal error: initState cannot be null`);
                    }
                    const buildState = await project.build(projectFile, stackName,
                                                           initState);
                    await history.appendState(buildState);
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
