import { flags } from "@oclif/command";
import { cantDeploy, DeployBase } from "../../base";
import { UserError } from "../../error";
import { CreateOptions, DeployState, isDeploySuccess } from "../../types/adapt_shared";

export default class CreateCommand extends DeployBase {
    static description = "Create a new deployment for an Adapt project";

    static examples = [
`Deploy the stack named "dev" from the default project description file, index.tsx:
    $ adapt deploy:create dev`,
`Deploy the stack named "dev" from an alternate description file:
    $ adapt deploy:create --rootFile somefile.tsx dev`,
    ];

    static flags = {
        ...DeployBase.flags,
        init: flags.boolean({
            description: "Initialize a new local deployment server if it doesn't exist",
        }),
    };

    static args = [
        {
            name: "stackName",
            required: true,
        },
    ];

    async run() {
        // NOTE(mark): Why doesn't oclif set the boolean flags to false?
        if (this.flags.init === undefined) this.flags.init = false;

        const ctx = this.ctx;
        if (ctx == null) {
            throw new Error(`Internal error: ctx cannot be null`);
        }

        this.tasks.add([
            {
                title: "Creating new project deployment",
                task: async () => {
                    if (ctx.project == null) {
                        throw new Error(`Internal error: project cannot be null`);
                    }

                    let deployState: DeployState;
                    try {
                        const createOptions: CreateOptions = {
                            adaptUrl: ctx.adaptUrl,
                            debug: ctx.debug,
                            dryRun: ctx.dryRun,
                            fileName: ctx.projectFile,
                            projectName: ctx.project.name,
                            stackName: ctx.stackName,
                            initLocalServer: this.flags.init,
                        };
                        deployState = await ctx.project.create(createOptions);

                    } catch (err) {
                        if (err.message.match(/No plugins registered/)) {
                            this.error(cantDeploy +
                                `The project did not import any Adapt plugins`);
                        }
                        if (err instanceof UserError) this.error(err.message);
                        throw err;
                    }

                    if (!isDeploySuccess(deployState)) {
                        return this.deployFailure(deployState);
                    } else {
                        this.deployInformation(deployState);
                    }

                    const id = deployState.deployID;

                    this.log(`\nDeployment created successfully. DeployID is: ${id}`);
                }
            }
        ]);

        await this.tasks.run();
    }

}
