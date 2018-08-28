import { Action, AdaptElement, build } from "@usys/adapt";
import { sleep } from "@usys/utils";
import * as fs from "fs-extra";
import { xor } from "lodash";
import * as path from "path";
import * as should from "should";
import * as util from "util";

import { AwsCredentialsProps } from "../../src/aws";
import {
    filterStacks,
} from "../../src/aws/aws_plugin";

/*
 * Real resources in AWS
 * These are actual names/IDs of items that must exist in AWS.
 */

// ami-0411d593eba4708e5 = Ubuntu 16.04.20180814 Xenial us-west-2
export const ubuntuAmi = "ami-0411d593eba4708e5";

// FIXME(mark): Need to figure out how to best handle the SSH keys. This
// key name exists in my account...
export const sshKeyName = "DefaultKeyPair";
// FIXME(mark): The security group can be created as part of each stack.
export const defaultSecurityGroup = "http-https-ssh";

export async function doBuild(elem: AdaptElement) {
    const { messages, contents: dom } = await build(elem, null);
    if (dom == null) {
        should(dom).not.Null();
        should(dom).not.Undefined();
        throw new Error("Unreachable");
    }

    should(messages).have.length(0);
    return dom;
}

export async function act(actions: Action[]) {
    for (const action of actions) {
        try {
            await action.act();
        } catch (e) {
            throw new Error(`${action.description}: ${util.inspect(e)}`);
        }
    }
}

export function checkProp(obj: any, prop: string) {
    if (typeof obj[prop] !== "string") {
        throw new Error(`.adaptAwsCreds invalid: ${prop} missing or invalid`);
    }
}

export async function loadCreds(): Promise<AwsCredentialsProps> {
    const home = process.env.HOME;
    if (home == null) throw new Error(`HOME environment variable is not set`);
    const creds = await fs.readJson(path.join(home, ".adaptAwsCreds"));
    checkProp(creds, "awsAccessKeyId");
    checkProp(creds, "awsSecretAccessKey");
    checkProp(creds, "awsRegion");
    return creds;
}

export function isFailure(stackStatus: AWS.CloudFormation.StackStatus) {
    return /FAILED/.test(stackStatus);
}
export function isInProgress(stackStatus: AWS.CloudFormation.StackStatus) {
    return /IN_PROGRESS/.test(stackStatus);
}
export function isTerminal(stackStatus: AWS.CloudFormation.StackStatus) {
    return !isInProgress(stackStatus);
}

export async function getStacks(client: AWS.CloudFormation, deployID?: string) {
    const resp = await client.describeStacks().promise();
    if (deployID !== undefined) return filterStacks(resp.Stacks, deployID);
    return resp.Stacks || [];
}

export async function deleteAllStacks(client: AWS.CloudFormation, deployID: string,
                                      timeoutMs = 10 * 1000) {
    let stacks = await getStacks(client, deployID);
    for (const s of stacks) {
        const name = s.StackId || s.StackName;
        await client.deleteStack({ StackName: name }).promise();
    }

    do {
        stacks = await getStacks(client, deployID);
        if (stacks.length === 0) return;
        await sleep(1000);
        timeoutMs -= 1000;
    } while (timeoutMs > 0);
    throw new Error(`Unable to delete stacks`);
}

export interface WaitOptions {
    timeoutMs?: number;
    terminalOnly?: boolean;
}
const waitDefaults = {
    timeoutMs: 30 * 1000,
    terminalOnly: true,
};

export async function waitForStacks(client: AWS.CloudFormation, deployID: string,
                                    stackNames: string[], options?: WaitOptions) {
    const opts = { ...waitDefaults, ...options };
    let timeoutMs = opts.timeoutMs;
    let actual: string[][];
    do {
        let stacks = await getStacks(client, deployID);
        actual = stacks.map((s) => [s.StackName, s.StackStatus]);
        if (opts.terminalOnly) {
            stacks = stacks.filter((s) => isTerminal(s.StackStatus));
        }
        const names = stacks.map((s) => s.StackName);
        if (xor(names, stackNames).length === 0) return stacks;
        await sleep(1000);
        timeoutMs -= 1000;
    } while (timeoutMs > 0);
    throw new Error(`Timeout waiting for stacks. Expected: ${stackNames} Actual: ${actual}`);
}

export async function checkStackStatus(stack: AWS.CloudFormation.Stack,
                                       expected: AWS.CloudFormation.StackStatus,
                                       logOnFail = false,
                                       client?: AWS.CloudFormation) {
    if (logOnFail && isFailure(stack.StackStatus) && stack.StackStatus !== expected) {
        if (!client) throw new Error(`client cannot be null if logOnFail=true`);
        const resp = await client.describeStackEvents({
            StackName: stack.StackId || stack.StackName
        }).promise();
        const events = resp.StackEvents;
        if (events) {
            const info = events.map((e) => {
                let msg = `${e.ResourceStatus} ${e.ResourceType}`;
                if (e.ResourceStatusReason) msg += `: ${e.ResourceStatusReason}`;
                return msg;
            });
            // tslint:disable-next-line:no-console
            console.log(info.join("\n"));
        }
    }
    should(stack.StackStatus).equal(expected);
}
