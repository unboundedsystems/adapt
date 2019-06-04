import readPkgUp from "read-pkg-up";
import { clitest, expect } from "./common/fancy";

let loadedPJson: { [key: string]: any } | undefined;
async function getPJson() {
    if (loadedPJson) return loadedPJson;
    const pkg = await readPkgUp({ cwd: __dirname });
    if (!pkg) throw new Error(`No package.json??`);
    loadedPJson = pkg.pkg;
    return loadedPJson;
}

describe("Help", () => {

    clitest
    .stdout()
    .command("help")
    .it("Should show aliases", async ({stdout}) => {
        const pJson = await getPJson();
        expect(stdout).equals(
`Command line interface for Adapt

VERSION
  ${pJson.name}/${pJson.version} linux-x64 node-${process.version}

USAGE
  $ adapt [COMMAND]

COMMANDS
  autocomplete  display autocomplete installation instructions
  deploy        Manage deployments of Adapt projects
  destroy       Destroy an existing deployment of an Adapt project
  help          display help for adapt
  list          List active Adapt deployments
  new           Create a new Adapt project
  project       Manage Adapt projects
  run           Create a new deployment for an Adapt project
  status        Fetch the status of an existing deployment of an Adapt project
  update        Update an existing deployment of an Adapt project

`
        );
    });
});
