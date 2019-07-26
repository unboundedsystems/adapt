import { expect } from "fancy-test";
import { Env, runCommand } from "./run_command";

export const newDeployRegex = /Deployment created(?:.|\n)*DeployID is: (.*)$/m;
export function getNewDeployID(stdout: string) {
    let deployID: string | undefined;
    const matches = stdout.match(newDeployRegex);
    if (Array.isArray(matches) && matches[1]) deployID = matches[1];
    if (!deployID) throw new Error(`Cannot find DeployID in output`);
    return deployID;
}

const destroyDefaults = {
    env: {}
};

export async function destroyAll(options: { env?: Env } = {}) {
    const opts = { ...destroyDefaults, ...options };
    const list = await runCommand(["deploy:list", "-q"], opts.env);
    expect(list.stderr).equals("");
    const deployments = list.stdout.split("\n")
        .map((l) => l.trim())
        .filter((l) => !!l);
    for (const d of deployments) {
        const out = await runCommand(["deploy:destroy", "-q", d], opts.env);
        expect(out.stderr).equals("");
        expect(out.stdout).contains(`Deployment ${d} stopped successfully`);
    }
    const final = await runCommand(["deploy:list", "-q"], opts.env);
    expect(final.stderr).equals("");
    expect(final.stdout).equals("");
}

const marker = "\n-- DIVIDER --";
/**
 * Put a marker in stdout. This is needed because our current method of
 * capturing stdout doesn't allow for it to be reset during a test.
 */
export function stdoutDivider() {
    // tslint:disable-next-line: no-console
    console.log(marker);
}

export function stdoutDivide(output: string) {
    return output.split(marker);
}
