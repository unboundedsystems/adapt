import { gitSshExe, isOpenSsh, withGitSshCommand } from "../../src/proj/ssh";
import { clitest, expect } from "../common/fancy";

//.stub(process.stdout, "isTTY", false); // Turn off progress, etc

const defaultSshPath = "/usr/bin/ssh";

describe("isOpenSsh", () => {
    it("Should detect OpenSSH", () => {
        expect(isOpenSsh(defaultSshPath)).to.be.true;
    });

    it("Should detect non-OpenSSH", () => {
        expect(isOpenSsh("/bin/cat")).to.be.false;
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
        expect(gitSshExe()).equals("/bin/cat");
    });

    clitest
    .env({
        GIT_SSH: undefined,
        GIT_SSH_COMMAND: `  'cat'  isn\\'t ssh `,
    })
    .it("Should return bin from GIT_SSH_COMMAND with extra shell characters", () => {
        expect(gitSshExe()).equals("/bin/cat");
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
        expect(gitSshExe()).equals("/bin/cat");
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
        expect(gitSshExe()).equals("/bin/echo");
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
