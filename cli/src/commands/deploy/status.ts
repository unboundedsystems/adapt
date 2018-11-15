import { DeployBase } from "../../base";
import { UserError } from "../../error";
import { DeployState, isDeploySuccess, StatusOptions } from "../../types/adapt_shared";

export default class StatusCommand extends DeployBase {
    static description = "Fetch the status of an existing deployment of an Adapt project";

    static examples = [
`
Fetch the status of deployment "myproj-dev-abcd", for the stack named "dev" from
the default project description file, "index.tsx":
    $ adapt deploy:status myproj-dev-abcd dev

Fetch the status of deployment "myproj-dev-abcd", for the stack named "dev" from
an alternate description file, "somefile.tsx":
    $ adapt deploy:status --rootFile somefile.tsx myproj-dev-abcd dev`,
    ];

    static flags = {
        ...DeployBase.flags,
    };

    static args = [
        {
            name: "deployID",
            required: true,
        },
        {
            name: "stackName",
            required: true,
        }
    ];

    async run() {
        const deployID: string | undefined = this.args.deployID;
        if (deployID == null) {
            throw new Error(`Internal error: deployID cannot be null`);
        }

        const ctx = this.ctx;
        if (ctx == null) {
            throw new Error(`Internal error: ctx cannot be null`);
        }

        this.tasks.add([
           {
                title: "Fetching status for project deployment",
                task: async () => {
                    if (ctx.project == null) {
                        throw new Error(`Internal error: project cannot be null`);
                    }

                    let deployState: DeployState;
                    try {
                        const statusOptions: StatusOptions = {
                            adaptUrl: ctx.adaptUrl,
                            deployID,
                            dryRun: ctx.dryRun,
                            fileName: ctx.projectFile,
                            stackName: ctx.stackName,
                        };
                        deployState = await ctx.project.status(statusOptions);
                    } catch (err) {
                        if (err instanceof UserError) this.error(err.message);
                        throw err;
                    }

                    if (!isDeploySuccess(deployState)) {
                        return this.deployFailure(deployState);
                    } else {
                        this.deployInformation(deployState);
                    }

                    const id = deployState.deployID;

                    this.log(`Deployment ${id} status:`);
                    this.log(JSON.stringify(deployState.mountedOrigStatus, null, 2));
                }
            }
        ]);

        await this.tasks.run();
    }
}
