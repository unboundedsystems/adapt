import { InternalError } from "@adpt/utils";
import execa from "execa";
import { isAbsolute } from "path";
import shellWords from "shellwords-ts";
import which from "which";

export function isOpenSsh(exeAbsPath: string) {
    if (!isAbsolute(exeAbsPath)) {
        throw new InternalError(`isOpenSsh: '${exeAbsPath}' is not an absolute path`);
    }
    try {
        const { stderr } = execa.sync(exeAbsPath, ["-V"]);
        return stderr.includes("OpenSSH");
    } catch (err) {
        return false;
    }
}

export function gitSshExe(): string {
    let exe: string | undefined;

    const gitSshCmd = process.env.GIT_SSH_COMMAND;
    if (gitSshCmd) {
        const first = shellWords.split(gitSshCmd)[0];
        if (first) exe = first;
        else throw new Error(`Error parsing GIT_SSH_COMMAND value '${gitSshCmd}'`);
    }
    if (!exe) {
        const gitSsh = process.env.GIT_SSH;
        if (gitSsh) exe = gitSsh;
    }
    if (!exe) exe = "ssh";

    // Return absolute path if we can
    if (isAbsolute(exe)) return exe;
    try {
        return which.sync(exe);
    } catch (err) {
        return exe;
    }
}

export function gitUsesOpenSsh() {
    return isOpenSsh(gitSshExe());
}

export async function withGitSshCommand<T>(hostKeyCheck: string, f: () => T | Promise<T>) {
    if (hostKeyCheck === "unset") return f();  // No environment changes

    const origVal = process.env.GIT_SSH_COMMAND;
    const newVal = addHostKeyChecking(hostKeyCheck);
    try {
        process.env.GIT_SSH_COMMAND = newVal;
        return await f();
    } finally {
        if (origVal !== undefined) process.env.GIT_SSH_COMMAND = origVal;
        else delete process.env.GIT_SSH_COMMAND;
    }
}

export function addHostKeyChecking(hostKeyCheck: string) {
    let exe = "ssh";
    let args: string[] = [];

    const gitSshCmd = process.env.GIT_SSH_COMMAND;
    if (gitSshCmd) {
        const parsed = shellWords.split(gitSshCmd);
        if (parsed.length === 0) throw new Error(`Error parsing GIT_SSH_COMMAND value '${gitSshCmd}'`);
        exe = parsed[0];
        args = parsed.slice(1);
    } else {
        const gitSsh = process.env.GIT_SSH;
        if (gitSsh) exe = gitSsh;
    }

    return shellWords.join([
        exe,
        "-o", `StrictHostKeyChecking=${hostKeyCheck}`,
        ...args
    ]);
}
