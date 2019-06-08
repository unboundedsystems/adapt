import { UserError } from "@usys/utils";
import Listr = require("listr");
import { isString } from "lodash";
import path from "path";
import { AdaptBase } from "../../base";
import { createStarter } from "../../proj";

const logString = (task: Listr.ListrTaskWrapper) => (msg: string) => task.output = msg;

export default class NewCommand extends AdaptBase {
    static description = "Create a new Adapt project";
    static aliases = [ "new" ];

    static examples = [
        `Create a new project into the directory './myproj' using the starter ` +
        `named 'blank' from the Adapt starter gallery:\n` +
        `    $ adapt <%- command.id %> blank myproj`,
    ];

    static flags = { ...AdaptBase.flags };
    static strict = false;
    static args = [
        {
            name: "starter",
            required: true,
            description: `Adapt starter to use. May be the name of a starter ` +
                `from the starter gallery, a URL, a local file path, or most ` +
                `formats supported by npm.`
        },
        {
            name: "directory",
            default: ".",
            description: `Directory where the new project should be created. ` +
                `The directory will be created if it does not exist.`
        }
    ];

    static usage = [
        "<%- command.id %> STARTER [DIRECTORY]",
        "<%- command.id %> STARTER DIRECTORY [STARTER_ARGS...]",
    ];

    async init() {
        await super.init();
        this.parse();
    }

    async run() {
        const spec = this.args.starter;
        const dest = this.args.directory;
        const argv = this.cmdArgv.length >= 3 ? this.cmdArgv.slice(2) : [];

        if (!spec) {
            throw new UserError(`Missing 1 required arg:\nstarter\nSee more help with --help`);
        }
        if (!dest || !isString(dest)) {
            throw new UserError(`Directory argument is not a string`);
        }

        const starter = createStarter(spec, path.resolve(dest), argv);
        try {
            await starter.init();

            const tasks = new Listr(this.outputSettings.listrOptions);
            tasks.add([
                {
                    title: "Downloading starter",
                    enabled: () => !starter.isLocal,
                    task: (_ctx, task) => starter.download(logString(task)),
                },
                {
                    title: "Creating new project",
                    task: (_ctx, task) => starter.run(logString(task)),
                },
            ]);

            await tasks.run();

        } finally {
            await starter.cleanup();
        }
    }
}
