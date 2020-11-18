/*
 * Copyright 2019-2020 Unbounded Systems, LLC
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

import which from "which";
import { gitSshExe, isOpenSsh, withGitSshCommand } from "../../src/proj/ssh";
import { clitest, expect } from "../common/fancy";

//.stub(process.stdout, "isTTY", false); // Turn off progress, etc

function getExePath(prog: string): string {
    try {
        return which.sync(prog);
    } catch (err) {
        throw new Error(`Unable to test CLI ssh support. No '${prog}' found in PATH. PATH='${process.env.PATH}'`);
    }
}

const defaultSshPath = getExePath("ssh");
const catPath = getExePath("cat");
const echoPath = getExePath("echo");

describe("isOpenSsh", () => {
    it("Should detect OpenSSH", () => {
        expect(isOpenSsh(defaultSshPath)).to.be.true;
    });

    it("Should detect non-OpenSSH", () => {
        expect(isOpenSsh(catPath)).to.be.false;
    });
});

describe("gitSshExe", () => {
    clitest
    .env({
        GIT_SSH: undefined,
        GIT_SSH_COMMAND: undefined,
    })
    .it("Should return ssh from path with no env set", () => {
        expect(gitSshExe()).equals(defaultSshPath);
    });

    clitest
    .env({
        GIT_SSH: undefined,
        GIT_SSH_COMMAND: "ssh -F /dev/null",
    })
    .it("Should return full path from GIT_SSH_COMMAND", () => {
        expect(gitSshExe()).equals(defaultSshPath);
    });

    clitest
    .env({
        GIT_SSH: undefined,
        GIT_SSH_COMMAND: "cat",
    })
    .it("Should return full path to alternate bin from GIT_SSH_COMMAND", () => {
        expect(gitSshExe()).equals(catPath);
    });

    clitest
    .env({
        GIT_SSH: undefined,
        GIT_SSH_COMMAND: `  'cat'  isn\\'t ssh `,
    })
    .it("Should return bin from GIT_SSH_COMMAND with extra shell characters", () => {
        expect(gitSshExe()).equals(catPath);
    });

    clitest
    .env({
        GIT_SSH: undefined,
        GIT_SSH_COMMAND: "dog food",
    })
    .it("Should return first word if command not found", () => {
        expect(gitSshExe()).equals("dog");
    });

    clitest
    .env({
        GIT_SSH: "cat",
        GIT_SSH_COMMAND: undefined,
    })
    .it("Should return full path to alternate bin from GIT_SSH", () => {
        expect(gitSshExe()).equals(catPath);
    });

    clitest
    .env({
        GIT_SSH: "a command",
        GIT_SSH_COMMAND: undefined,
    })
    .it("Should not parse GIT_SSH", () => {
        expect(gitSshExe()).equals("a command");
    });

    clitest
    .env({
        GIT_SSH: "cat",
        GIT_SSH_COMMAND: "echo some command",
    })
    .it("Should GIT_SSH_COMMAND take priority over GIT_SSH", () => {
        expect(gitSshExe()).equals(echoPath);
    });
});

describe("withGitSshCommand", () => {
    clitest
    .env({
        GIT_SSH: undefined,
        GIT_SSH_COMMAND: undefined,
    })
    .it("Should use ssh from path with no env set", async () => {
        await withGitSshCommand("no", () => {
            expect(process.env.GIT_SSH_COMMAND).equals("ssh -o StrictHostKeyChecking\\=no");
        });
        expect(process.env.GIT_SSH_COMMAND).is.undefined;
    });

    clitest
    .env({
        GIT_SSH: "myssh",
        GIT_SSH_COMMAND: undefined,
    })
    .it("Should use command from GIT_SSH", async () => {
        await withGitSshCommand("no", () => {
            expect(process.env.GIT_SSH_COMMAND).equals("myssh -o StrictHostKeyChecking\\=no");
        });
        expect(process.env.GIT_SSH_COMMAND).is.undefined;
    });

    clitest
    .env({
        GIT_SSH: undefined,
        GIT_SSH_COMMAND: `'/bin/otherssh' `,
    })
    .it("Should use command from GIT_SSH_COMMAND", async () => {
        await withGitSshCommand("no", () => {
            expect(process.env.GIT_SSH_COMMAND).equals("/bin/otherssh -o StrictHostKeyChecking\\=no");
        });
        expect(process.env.GIT_SSH_COMMAND).equals(`'/bin/otherssh' `);
    });

    clitest
    .env({
        GIT_SSH: "myssh",
        GIT_SSH_COMMAND: "yourssh",
    })
    .it("Should GIT_SSH_COMMAND take priority over GIT_SSH", async () => {
        await withGitSshCommand("no", () => {
            expect(process.env.GIT_SSH_COMMAND).equals("yourssh -o StrictHostKeyChecking\\=no");
        });
        expect(process.env.GIT_SSH_COMMAND).equals("yourssh");
    });

    clitest
    .env({
        GIT_SSH: undefined,
        GIT_SSH_COMMAND: `'some complex command' -F /dev/null `,
    })
    .it("Should insert option after first word of GIT_SSH_COMMAND", async () => {
        await withGitSshCommand("no", () => {
            expect(process.env.GIT_SSH_COMMAND)
                .equals("some\\ complex\\ command -o StrictHostKeyChecking\\=no -F /dev/null");
        });
        expect(process.env.GIT_SSH_COMMAND).equals(`'some complex command' -F /dev/null `);
    });
});
