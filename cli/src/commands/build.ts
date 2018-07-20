import { Command, flags } from "@oclif/command";
import * as fs from "fs-extra";
import Listr = require("listr");
import * as path from "path";

import { getGen, load, Project, ProjectOptions, Session } from "../proj";

const cantBuild = "This project cannot be built.\n";

export default class BuildCommand extends Command {
    static description = "Build the DOM for a project";

    static examples = [
        `
  Build the stack named "dev" from the default project description file, index.tsx:
    $ adapt build dev

  Build the stack named "dev" from an alternate description file:
    $ adapt build --rootFile somefile.tsx dev
`,
    ];

    static flags = {
        registry: flags.string({
            description: "URL of alternate NPM registry to use",
        }),
        rootFile: flags.string({
            description: "Project description file to build (.ts or .tsx)",
            default: "index.tsx",
        })
    };

    static args = [
        {
            name: "stackName",
            required: true,
        },
    ];

    async run() {
        const log = this.log;
        // tslint:disable-next-line:no-shadowed-variable
        const { args, flags } = this.parse(BuildCommand);
        const { stackName } = args;
        const cacheDir = path.join(this.config.cacheDir, "npmcache");

        if (flags.rootFile == null) throw new Error(`Internal error: rootFile cannot be null`);
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
        let project: Project | null = null;

        const tasks = new Listr([
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
                    const domString = await project.build(projectFile, stackName);
                    log(`DOM for stack '${stackName}':\n` + domString);
                }
            }
        ]);

        try {
            await tasks.run();
        } catch (err) {
            this.error(err);
        }
    }

}
