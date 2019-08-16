/*
 * Copyright 2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
