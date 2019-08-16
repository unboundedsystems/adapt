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

import { mochaTmpdir } from "@adpt/testutils";
import { grep } from "@adpt/utils";
import execa from "execa";
import fs from "fs-extra";
import path from "path";
import { clitest, expect } from "../../common/fancy";

const basicTestChain =
    clitest
    .stdout()
    .stderr()
    .stub(process.stdout, "isTTY", false); // Turn off progress, etc

function trying(stdout: string) {
    return grep(stdout, "Trying").map((l) => l.replace(/^.*Trying /, ""));
}

describe("project:new errors", () => {
    mochaTmpdir.each("adapt-cli-test-new");

    basicTestChain
    .command(["project:new"])
    .catch((err) => {
        expect(err.message).matches(/Missing 1 required arg:/);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should error if not enough args");

    basicTestChain
    .command(["project:new", "./doesntexist"])
    .catch((err) => {
        expect(err.message).equals(
            `Unable to use './doesntexist' as a starter: ` +
            `'${process.cwd()}/doesntexist' not found`);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should error if local spec doesn't exist");

    basicTestChain
    .do(() => fs.writeFile("./empty", ""))
    .command(["project:new", "./empty"])
    .catch((err) => {
        expect(err.message).equals(
            `Unable to use './empty' as a starter: ` +
            `'${process.cwd()}/empty' is not a directory`);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should error if local spec isn't a directory");

    basicTestChain
    .do(() => fs.ensureDir("./empty"))
    .command(["project:new", "./empty"])
    .catch((err) => {
        expect(err.message).equals(
            `Unable to use './empty' as a starter: ` +
            `no adapt_starter.json file found`);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should error adapt_starter.json not found");

    basicTestChain
    .do(async () => {
        await fs.ensureDir("./invalid");
        await fs.writeFile("./invalid/adapt_starter.json", "foo:");
    })
    .command(["project:new", "./invalid"])
    .catch((err) => {
        expect(err.message).equals(
            `Unable to use './invalid' as a starter: ` +
            `unable to parse adapt_starter.json: invalid character 'o' at 1:2`);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should error with invalid adapt_starter.json");
});

interface Files {
    [ filename: string ]: string;
}

async function writeFiles(files: Files, dest: string) {
    for (const rel of Object.keys(files)) {
        const file = path.resolve(dest, rel);
        if (rel.includes("/")) await fs.mkdirp(path.dirname(file));
        await fs.writeFile(file, files[rel]);
    }
}

async function checkFiles(files: Files, dest: string) {
    for (const rel of Object.keys(files)) {
        const file = path.resolve(dest, rel);
        const contents = (await fs.readFile(file)).toString();
        expect(contents).equals(files[rel]);
    }
}

const files1 = {
    "test.js": "test.js\n",
    "deploy/package.json": "package.json\n",
    "deploy/README": "README\n",
};

const dirOnly = {
    "deploy/package.json": "package.json\n",
};

describe("project:new files", () => {
    mochaTmpdir.each("adapt-cli-test-new");

    basicTestChain
    .do(async () => {
        await fs.ensureDir("./starter");
        await fs.writeJson("./starter/adapt_starter.json", {
            files: ["test.js", "deploy"]
        });
        await writeFiles(files1, "./starter");
    })
    .command(["project:new", "./starter", "project"])
    .it("Should create new project and copy files", async () => {
        await checkFiles(files1, "project");
    });

    basicTestChain
    .do(async () => {
        await fs.ensureDir("./starter");
        await fs.writeJson("./starter/adapt_starter.json", {
            files: ["test.js", "deploy"]
        });
        await writeFiles(files1, "./starter");
    })
    .command(["new", "./starter", "project"])
    .it("Should create new project and copy files using alias", async () => {
        await checkFiles(files1, "project");
    });

    basicTestChain
    .do(async () => {
        await fs.ensureDir("./starter");
        await fs.writeJson("./starter/adapt_starter.json", {
            files: ["deploy"]
        });
        await writeFiles(dirOnly, "./starter");
    })
    .command(["project:new", "./starter", "project"])
    .it("Should create new project with a single dir to copy", async () => {
        await checkFiles(dirOnly, "project");
    });

    basicTestChain
    .do(async () => {
        await fs.ensureDir("./starter");
        await fs.writeJson("./starter/adapt_starter.json", {
            files: ["test.js", "deploy", "foo"]
        });
        await writeFiles(files1, "./starter");
    })
    .command(["project:new", "./starter", "project"])
    .catch((err) => {
        const f = path.resolve("starter/foo");
        expect(err.message).equals(
            `Unable to use './starter' as a starter: ` +
            `Error copying files: '${f}' not found`);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should error if files are not present in starter");
});

// Name of a starter repo that exists in the gallery, but specifically set up
// for these unit tests.
const testStarter = "cli-unit-tests";

// The version of Adapt to use for simple starter tests. The testStarter repo
// above should have a tag that corresponds to this version. The tag should
// follow the Adapt Version Label format for starters.
// Example tag: adapt-v0.0.3
const testAdaptVer = "0.0.3";
const testAdaptVerCli = "--adaptVersion=" + testAdaptVer;
const testAdaptVerLabel = "adapt-v" + testAdaptVer;

// Name of a starter repo that is private and therefore requires credentials
// to access.
const testStarterPrivate = "gitlab:adpt/starters/cli-unit-tests-private";

async function checkAdaptVersion(expectedLabel: string) {
    const verPath = path.resolve(path.join("project", "ADAPT_VERSION"));
    const actual = (await fs.readFile(verPath)).toString().replace(/\s+/g, "");
    expect(actual).equals(expectedLabel, "Downloaded ADAPT_VERSION doesn't match expected");
}

async function checkTestStarter(expectedLabel: string) {
    await checkAdaptVersion(expectedLabel);
    const pjPath = path.resolve(path.join("project", "package.json"));
    const pkg = await fs.readJson(pjPath);
    expect(pkg.name).equals(testStarter);
}

describe("project:new download", () => {
    mochaTmpdir.each("adapt-cli-test-new");

    basicTestChain
    .command(["project:new", testAdaptVerCli, `git+https://gitlab.com/adpt/starters/${testStarter}`, "project"])
    .it("Should download from git+https URL", async ({ stdout, stderr }) => {
        expect(stderr).equals("");
        expect(stdout).matches(/Downloading starter \[completed\]/);
        expect(stdout).matches(/Creating new project \[completed\]/);

        await checkTestStarter(testAdaptVerLabel);
        expect(trying(stdout)).eqls([
            `git+https://gitlab.com/adpt/starters/${testStarter}#${testAdaptVerLabel}`,
        ]);
    });

    basicTestChain
    .command(["project:new", testAdaptVerCli, `gitlab:adpt/starters/${testStarter}`, "project"])
    .it("Should download from gitlab: URL", async ({ stdout, stderr }) => {
        expect(stderr).equals("");
        expect(stdout).matches(/Downloading starter \[completed\]/);
        expect(stdout).matches(/Creating new project \[completed\]/);

        await checkTestStarter(testAdaptVerLabel);
        expect(trying(stdout)).eqls([
            `gitlab:adpt/starters/${testStarter}#${testAdaptVerLabel}`,
        ]);
    });

    basicTestChain
    .command(["project:new", testAdaptVerCli, testStarter, "project"])
    .it("Should download from adpt gallery", async ({ stdout, stderr }) => {
        expect(stderr).equals("");
        expect(stdout).matches(/Downloading starter \[completed\]/);
        expect(stdout).matches(/Creating new project \[completed\]/);

        await checkTestStarter(testAdaptVerLabel);
        expect(trying(stdout)).eqls([
            `git+https://gitlab.com/adpt/starters/${testStarter}#${testAdaptVerLabel}`,
        ]);
    });

    basicTestChain
    .command(["project:new", testAdaptVerCli, "is-promise", "project"])
    .catch((err) => {
        expect(err.message).equals(
            `Unable to use 'is-promise' as a starter: ` +
            `no adapt_starter.json file found`);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should try to download from registry and only try gallery once", ({ stdout }) => {
        expect(trying(stdout)).eqls([
            `git+https://gitlab.com/adpt/starters/is-promise#adapt-v0.0.3`,
            `is-promise@adapt-v0.0.3`,
            `is-promise@adapt-v0.0`,
            `is-promise@adapt-v0`,
            `is-promise`,
        ]);
    });

    basicTestChain
    .command(["project:new", "--adaptVersion=0.0.4-next.0", testStarter, "project"])
    .it("Should download prerelease version from adpt gallery with git tag", async ({ stdout, stderr }) => {
        expect(stderr).equals("");
        expect(stdout).matches(/Downloading starter \[completed\]/);
        expect(stdout).matches(/Creating new project \[completed\]/);

        await checkTestStarter("adapt-v0.0.4-next.0");
        expect(trying(stdout)).eqls([
            `git+https://gitlab.com/adpt/starters/${testStarter}#adapt-v0.0.4-next.0`,
        ]);
    });

    basicTestChain
    .command(["project:new", "--adaptVersion=0.0.4-alpha", testStarter, "project"])
    .it("Should download minor version from adpt gallery with git branch", async ({ stdout, stderr }) => {
        expect(stderr).equals("");
        expect(stdout).matches(/Downloading starter \[completed\]/);
        expect(stdout).matches(/Creating new project \[completed\]/);

        await checkTestStarter("adapt-v0.0");
        expect(trying(stdout)).eqls([
            `git+https://gitlab.com/adpt/starters/${testStarter}#adapt-v0.0.4-alpha`,
            `git+https://gitlab.com/adpt/starters/${testStarter}#adapt-v0.0.4`,
            `git+https://gitlab.com/adpt/starters/${testStarter}#adapt-v0.0`,
        ]);
    });

    basicTestChain
    .command(["project:new", "--adaptVersion=0.1.4", testStarter, "project"])
    .it("Should download major version from adpt gallery with git branch", async ({ stdout, stderr }) => {
        expect(stderr).equals("");
        expect(stdout).matches(/Downloading starter \[completed\]/);
        expect(stdout).matches(/Creating new project \[completed\]/);

        await checkTestStarter("adapt-v0");
        expect(trying(stdout)).eqls([
            `git+https://gitlab.com/adpt/starters/${testStarter}#adapt-v0.1.4`,
            `git+https://gitlab.com/adpt/starters/${testStarter}#adapt-v0.1`,
            `git+https://gitlab.com/adpt/starters/${testStarter}#adapt-v0`,
        ]);
    });

    basicTestChain
    .command(["project:new", "--adaptVersion=1.0.0", testStarter, "project"])
    .it("Should download master branch from adpt gallery", async ({ stdout, stderr }) => {
        expect(stderr).equals("");
        expect(stdout).matches(/Downloading starter \[completed\]/);
        expect(stdout).matches(/Creating new project \[completed\]/);

        await checkTestStarter("master");
        expect(trying(stdout)).eqls([
            `git+https://gitlab.com/adpt/starters/${testStarter}#adapt-v1.0.0`,
            `git+https://gitlab.com/adpt/starters/${testStarter}#adapt-v1.0`,
            `git+https://gitlab.com/adpt/starters/${testStarter}#adapt-v1`,
            `git+https://gitlab.com/adpt/starters/${testStarter}`,
        ]);
    });

    basicTestChain
    .command(["project:new", "--adaptVersion=1.0.0", "@unboundedsystems/doesntexist", "project"])
    .catch((err) => {
        expect(err.message).equals(
            `Unable to use '@unboundedsystems/doesntexist' as a starter: ` +
            `404 Not Found - GET https://registry.npmjs.org/@unboundedsystems%2fdoesntexist - Not found`);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should try non-existent npm package only once", async ({ stdout }) => {
        expect(trying(stdout)).eqls([
            `@unboundedsystems/doesntexist@adapt-v1.0.0`,
        ]);
    });

});

/**
 * Because --sshHostKeyCheck manipulates the process environment variables AND
 * pacote (used by adapt project:new) caches the environment, we need to run
 * these tests in a separate process to get pacote to load the current env
 * each time.
 */
describe("project:new sshHostKeyCheck", () => {
    const cliBin = path.resolve("./bin/run");

    mochaTmpdir.each("adapt-cli-test-new");

    basicTestChain
    .withSshKey()
    .it("Should download private gitlab repo with SSH and add host key", async (ctx) => {
        const args = ["project:new", testAdaptVerCli, "--sshHostKeyCheck=no", testStarterPrivate, "project"];
        const env = {
            GIT_SSH_COMMAND: `ssh -i ${ctx.withSshKeyFile} -o UserKnownHostsFile=/dev/null`,
        };
        const out = await execa(cliBin, args, { env });
        const { stdout, stderr } = out;

        expect(stderr).equals("");
        expect(stdout).matches(/Downloading starter \[completed\]/);
        expect(stdout).matches(/Creating new project \[completed\]/);

        await checkAdaptVersion(testAdaptVerLabel);
        expect(trying(stdout)).eqls([
            `${testStarterPrivate}#${testAdaptVerLabel}`,
        ]);
    });

    basicTestChain
    .it("Should try only once on SSH host key verification failure", async () => {
        const args = ["project:new", "--adaptVersion=1.0.0", testStarterPrivate, "project"];
        const env = {
            // Ensure we have no known hosts
            GIT_SSH_COMMAND: `ssh -o UserKnownHostsFile=/dev/null`,
        };
        try {
            const ret = await execa(cliBin, args, { env });
            // tslint:disable-next-line: no-console
            console.log(`Expected command to fail.\n${ret.stdout}\n${ret.stderr}`);
            throw new Error(`Expected command to fail`);
        } catch (err) {
            expect(err.code).to.equal(2);
            expect(err.stderr).matches(/Host key verification failed/);
            expect(trying(err.stdout)).eqls([
                `${testStarterPrivate}#adapt-v1.0.0`,
            ]);
        }
    });
});

describe("project:new scripts", () => {
    mochaTmpdir.each("adapt-cli-test-new");

    basicTestChain
    .do(async () => {
        await fs.ensureDir("./starter");
        await fs.writeJson("./starter/adapt_starter.json", {
            init: "echo newfile > newfile",
        });
    })
    .command(["project:new", "./starter", "project"])
    .it("Should run script in project directory", async () => {
        const files = {
            newfile: "newfile\n"
        };
        await checkFiles(files, "project");
    });

    basicTestChain
    .do(async () => {
        await fs.ensureDir("./starter");
        await fs.writeJson("./starter/adapt_starter.json", {
            // tslint:disable-next-line: no-invalid-template-strings
            init: "${ADAPT_STARTER_DIR}/setup.sh",
        });
        await fs.writeFile("./starter/setup.sh",
            `#!/bin/sh
            echo Setup done > setup_done
            `);
        await fs.chmod("./starter/setup.sh", "0777");
    })
    .command(["project:new", "./starter", "project"])
    .it("Should provide starter environment variable", async () => {
        const files = {
            setup_done: "Setup done\n"
        };
        await checkFiles(files, "project");
    });

    basicTestChain
    .do(async () => {
        await fs.ensureDir("./starter");
        await fs.writeJson("./starter/adapt_starter.json", {
            init: "badcommand",
        });
    })
    .command(["project:new", "./starter", "project"])
    .catch((err) => {
        expect(err.message).equals(
            `Unable to use './starter' as a starter: ` +
            `Error running init script:\n` +
            `Command failed: badcommand\n` +
            `/bin/sh: 1: badcommand: not found\n\n`);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should error on bad command");

    basicTestChain
    .do(async () => {
        await fs.ensureDir("./starter");
        await fs.writeJson("./starter/adapt_starter.json", {
            init: "echo To stdout ; echo To stderr 1>&2; false",
        });
    })
    .command(["project:new", "./starter", "project"])
    .catch((err) => {
        expect(err.message).equals(
            `Unable to use './starter' as a starter: ` +
            `Error running init script:\n` +
            `Command failed: echo To stdout ; echo To stderr 1>&2; false\n` +
            `To stderr\n\n` +
            `To stdout\n`);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should error on non-zero exit code");

    async function createArgsStarter() {
        await fs.ensureDir("./starter");
        // A little script that just outputs its args
        await fs.writeFile("./starter/init.sh",
            `#!/bin/sh
            echo -n > output
            arg="$1"
            while [ -n "$arg" ] ; do
                echo "$arg" >> output
                shift
                arg="$1"
            done
            `);
        await fs.chmod("./starter/init.sh", "0777");
        await fs.writeJson("./starter/adapt_starter.json", {
            // tslint:disable-next-line: no-invalid-template-strings
            init: "${ADAPT_STARTER_DIR}/init.sh",
        });
    }

    basicTestChain
    .do(createArgsStarter)
    .command(["project:new", "./starter", "project"])
    .it("Should handle no args", async () => {
        const output = (await fs.readFile("./project/output")).toString();
        expect(output).equals("");
    });

    basicTestChain
    .do(createArgsStarter)
    .command(["project:new", "./starter", "project", "arg1", "arg2"])
    .it("Should handle simple args", async () => {
        const output = (await fs.readFile("./project/output")).toString();
        expect(output).equals("arg1\narg2\n");
    });

    const specialArgs = [
        `arg one`,
        ` "arg2'`,
        ` ; arg3 | `,
        ` \\ arg4`,
    ];

    basicTestChain
    .do(createArgsStarter)
    .command(["project:new", "./starter", "project", ...specialArgs])
    .it("Should handle args with special chars", async () => {
        const output = (await fs.readFile("./project/output")).toString();
        expect(output).equals(specialArgs.join("\n") + "\n");
    });
});
