import { Command, flags } from "@oclif/command";

export default class DomCommand extends Command {
    static description = "Build the DOM for a description file";

    /*
    static examples = [
        `$ adapt hello
hello world from ./src/hello.ts!
`,
    ];
    */

    static flags = {
        help: flags.help({char: "h"}),
        // flag with a value (-n, --name=VALUE)
        name: flags.string({char: "n", description: "name to print"}),
        // flag with no value (-f, --force)
        force: flags.boolean({char: "f"}),
    };

    static args = [
        {
            name: "file",
            required: true,
            description: "Description file to process",
        },
    ];

    async run() {
        // tslint:disable-next-line:no-shadowed-variable
        //const {args, flags} = this.parse(DomCommand);

        this.log(`hello world`);

        /*
        const name = flags.name || "world";
        this.log(`hello ${name} from ./src/commands/hello.ts`);
        if (args.file && flags.force) {
            this.log(`you input --force and --file: ${args.file}`);
        }
        */
    }
}
