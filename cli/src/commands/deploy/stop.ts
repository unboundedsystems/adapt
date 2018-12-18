import { DeployOpBase } from "../../base/deploy_base";
import { UpdateBaseCommand } from "./update";

export default class StopCommand extends UpdateBaseCommand {
    static description = "Stop an existing deployment of an Adapt project";

    static examples = [
        `
Stop the deployment "myproj-dev-abcd" using the default project description file, "index.tsx":
    $ adapt deploy:stop myproj-dev-abcd

Stop the deployment "myproj-dev-abcd" using an alternate description
file, "somefile.tsx":
    $ adapt deploy:stop --rootFile somefile.tsx myproj-dev-abcd`,
    ];

    static flags = {
        ...DeployOpBase.flags,
    };

    static args = [
        {
            name: "deployID",
            required: true,
        }
    ];

    ingverb = "stopping";
    edverb = "stopped";

    async run() {
        this.ctx.stackName = "(null)";
        return super.run();
    }
}
