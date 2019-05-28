import { mochaTmpdir } from "@usys/testutils";
import fs from "fs-extra";
import path from "path";
import { clitest, expect } from "../../common/fancy";

const basicTestChain =
    clitest
    .stdout()
    .stderr()
    .stub(process.stdout, "isTTY", false); // Turn off progress, etc

describe("project:init errors", () => {
    mochaTmpdir.each("adapt-cli-test-init");

    basicTestChain
    .command(["project:init"])
    .catch((err) => {
        expect(err.message).matches(/Missing 1 required arg:/);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should error if not enough args");

    basicTestChain
    .command(["project:init", "./doesntexist"])
    .catch((err) => {
        expect(err.message).equals(
            `Unable to use './doesntexist' as a starter: ` +
            `'${process.cwd()}/doesntexist' not found`);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should error if local spec doesn't exist");

    basicTestChain
    .do(() => fs.writeFile("./empty", ""))
    .command(["project:init", "./empty"])
    .catch((err) => {
        expect(err.message).equals(
            `Unable to use './empty' as a starter: ` +
            `'${process.cwd()}/empty' is not a directory`);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should error if local spec isn't a directory");

    basicTestChain
    .do(() => fs.ensureDir("./empty"))
    .command(["project:init", "./empty"])
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
    .command(["project:init", "./invalid"])
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

describe("project:init files", () => {
    mochaTmpdir.each("adapt-cli-test-init");

    basicTestChain
    .do(async () => {
        await fs.ensureDir("./starter");
        await fs.writeJson("./starter/adapt_starter.json", {
            files: ["test.js", "deploy"]
        });
        await writeFiles(files1, "./starter");
    })
    .command(["project:init", "./starter", "project"])
    .it("Should init new project and copy files", async () => {
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
    .command(["project:init", "./starter", "project"])
    .it("Should init new project with a single dir to copy", async () => {
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
    .command(["project:init", "./starter", "project"])
    .catch((err) => {
        const f = path.resolve("starter/foo");
        expect(err.message).equals(
            `Unable to use './starter' as a starter: ` +
            `Error copying files during init: '${f}' not found`);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should error if files are not present in starter");
});

describe("project:init download", () => {
    mochaTmpdir.each("adapt-cli-test-init");

    basicTestChain
    .command(["project:init", "git+https://gitlab.com/adpt/starters/blank", "project"])
    .it("Should download from git+https URL", async ({ stdout, stderr }) => {
        expect(stderr).equals("");
        expect(stdout).matches(/Downloading starter \[completed\]/);
        expect(stdout).matches(/Initializing new project \[completed\]/);

        const pjPath = path.resolve(path.join("project", "deploy", "package.json"));
        const pkg = await fs.readJson(pjPath);
        expect(pkg.name).equals("blank");
    });

    basicTestChain
    .command(["project:init", "gitlab:mterrel/blank", "project"])
    .it("Should download from gitlab: URL", async ({ stdout, stderr }) => {
        expect(stderr).equals("");
        expect(stdout).matches(/Downloading starter \[completed\]/);
        expect(stdout).matches(/Initializing new project \[completed\]/);

        const pjPath = path.resolve(path.join("project", "deploy", "package.json"));
        const pkg = await fs.readJson(pjPath);
        expect(pkg.name).equals("blank");
    });

    basicTestChain
    .command(["project:init", "blank", "project"])
    .it("Should download from adpt gallery", async ({ stdout, stderr }) => {
        expect(stderr).equals("");
        expect(stdout).matches(/Downloading starter \[completed\]/);
        expect(stdout).matches(/Initializing new project \[completed\]/);

        const pjPath = path.resolve(path.join("project", "deploy", "package.json"));
        const pkg = await fs.readJson(pjPath);
        expect(pkg.name).equals("blank");
    });

    basicTestChain
    .command(["project:init", "is-promise", "project"])
    .catch((err) => {
        expect(err.message).equals(
            `Unable to use 'is-promise' as a starter: ` +
            `no adapt_starter.json file found`);
        expect((err as any).oclif.exit).equals(2);
    })
    .it("Should try to download from registry");

});

describe("project:init scripts", () => {
    mochaTmpdir.each("adapt-cli-test-init");

    basicTestChain
    .do(async () => {
        await fs.ensureDir("./starter");
        await fs.writeJson("./starter/adapt_starter.json", {
            init: "echo newfile > newfile",
        });
    })
    .command(["project:init", "./starter", "project"])
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
    .command(["project:init", "./starter", "project"])
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
    .command(["project:init", "./starter", "project"])
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
    .command(["project:init", "./starter", "project"])
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
    .command(["project:init", "./starter", "project"])
    .it("Should handle no args", async () => {
        const output = (await fs.readFile("./project/output")).toString();
        expect(output).equals("");
    });

    basicTestChain
    .do(createArgsStarter)
    .command(["project:init", "./starter", "project", "arg1", "arg2"])
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
    .command(["project:init", "./starter", "project", ...specialArgs])
    .it("Should handle args with special chars", async () => {
        const output = (await fs.readFile("./project/output")).toString();
        expect(output).equals(specialArgs.join("\n") + "\n");
    });
});
