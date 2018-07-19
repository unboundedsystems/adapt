import { Command, flags } from "@oclif/command";
import * as fs from "fs-extra";
import Listr = require("listr");
import * as path from "path";

import { getGen, load, ProjectOptions, Session } from "../proj";

const cantBuild = "This project cannot be built.\n";

export default class BuildCommand extends Command {
    static description = "Build the DOM for a project";

    static examples = [
        `
  Build the default project description file, index.tsx:
    $ adapt build
  Build with alternate root file:
    $ adapt build somefile.tsx
`,
    ];

    static flags = {
        registry: flags.string({
            description: "URL of alternate NPM registry to use",
        })
    };

    static args = [
        {
            name: "projectFile",
            required: false,
            description: "Project description file to build (.ts or .tsx)",
            default: "index.tsx",
        },
    ];

    async run() {
        // tslint:disable-next-line:no-shadowed-variable
        const { args, flags } = this.parse(BuildCommand);
        const { projectFile } = args;
        const cacheDir = path.join(this.config.cacheDir, "npmcache");

        if (! await fs.pathExists(projectFile)) {
            this.error(`Project file '${projectFile}' does not exist`);
        }
        const projectDir = path.resolve(path.dirname(projectFile));

        await fs.ensureDir(cacheDir);

        const session: Session = {
            cacheDir,
            projectDir,
        };
        const projOpts: ProjectOptions = {
            session,
        };

        if (flags.registry) projOpts.registry = flags.registry;

        const tasks = new Listr([
            {
                title: "Validating project",
                task: () => load(projectDir, projOpts).then((project) => {
                    const gen = getGen(project);
                    if (!gen.matchInfo.matches) {
                        this.error(cantBuild +
                            `The following updates must be made:\n` +
                            gen.matchInfo.required.map(
                                (ui) => "  " + ui.message).join("\n"));
                    }
                })
                .catch((err) => {
                    if (err.code === "ENOPACKAGEJSON") {
                        this.error(cantBuild +
                            `The directory '${projectDir}' does not contain a ` +
                            `package.json file`);
                    }
                    throw err;
                })
            },
            {
                title: "Building project",
                task: () => Promise.resolve(),
            }
        ]);

        try {
            await tasks.run();
        } catch (err) {
            this.error(err);
        }
    }

}
