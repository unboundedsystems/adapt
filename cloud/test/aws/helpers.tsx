import { Action, AdaptElement, build, buildPrinter, StateStore } from "@usys/adapt";
import { sleep } from "@usys/utils";
import * as fs from "fs-extra";
import { xor } from "lodash";
import * as path from "path";
import * as should from "should";
import * as util from "util";

import { AwsCredentialsProps } from "../../src/aws";
import {
    findStackElems,
    stacksWithDeployID,
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

const debugBuild = false;
const buildOpts = debugBuild ? { recorder: buildPrinter() } : undefined;

export async function doBuild(elem: AdaptElement, stateStore?: StateStore) {
    const { contents: dom, messages } = await build(elem, null,
        { ...buildOpts, stateStore });
    if (dom == null) {
        should(dom).not.Null();
        should(dom).not.Undefined();
        throw new Error("Unreachable");
    }

    should(messages).have.length(0);
    return dom;
}

export function getStackNames(dom: AdaptElement): string[] {
    return findStackElems(dom).map((s) => s.props.StackName).sort();
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

export async function fakeCreds(): Promise<AwsCredentialsProps> {
    return {
        awsAccessKeyId: "fakeKeyID",
        awsSecretAccessKey: "fakeSecret",
        awsRegion: "us-west-2",
    };
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
export function isProbablyDeleted(stackStatus: AWS.CloudFormation.StackStatus) {
    return stackStatus === "DELETE_IN_PROGRESS" || stackStatus === "DELETE_COMPLETE";
}

export async function getStacks(client: AWS.CloudFormation, deployID?: string,
                                stackName?: string) {
    const resp = stackName ?
        await client.describeStacks({ StackName: stackName }).promise() :
        await client.describeStacks().promise();
    if (deployID !== undefined) return stacksWithDeployID(resp.Stacks, deployID);
    return resp.Stacks || [];
}

export async function deleteAllStacks(client: AWS.CloudFormation, deployID: string,
                                      timeoutMs = 20 * 1000, definite = true) {
    let stacks = await getStacks(client, deployID);
    for (const s of stacks) {
        const name = s.StackId || s.StackName;
        await client.deleteStack({ StackName: name }).promise();
    }

    do {
        stacks = await getStacks(client, deployID);
        // !definite allows stacks in progress of deletion to count as
        // deleted, so filter those out.
        if (!definite) stacks = stacks.filter((s) => !isProbablyDeleted(s.StackStatus));
        if (stacks.length === 0) return;

        await sleep(1000);
        timeoutMs -= 1000;
    } while (timeoutMs > 0);
    throw new Error(`Unable to delete stacks`);
}

type StatusFilter = (status: AWS.CloudFormation.StackStatus) => boolean;

export interface WaitOptions {
    timeoutMs?: number;
    terminalOnly?: boolean;
    searchDeleted?: boolean;
    statusFilter?: StatusFilter;
}
const waitDefaults = {
    timeoutMs: 30 * 1000,
    terminalOnly: true,
    searchDeleted: false,
    statusFilter: undefined,
};

export async function waitForStacks(client: AWS.CloudFormation, deployID: string,
                                    stackNames: string[], options?: WaitOptions) {
    const { statusFilter, ...opts } = { ...waitDefaults, ...options };
    let timeoutMs = opts.timeoutMs;
    let singleStackName: string | undefined;

    if (opts.searchDeleted) {
        if (stackNames.length !== 1) {
            throw new Error(
                `Must specify exactly one stack name when using searchDeleted`);
        }
        singleStackName = stackNames[0];
    }

    let actual: string[][];
    do {
        let stacks = await getStacks(client, deployID, singleStackName);
        actual = stacks.map((s) => [s.StackName, s.StackStatus]);

        if (statusFilter) stacks = stacks.filter((s) => statusFilter(s.StackStatus));
        if (opts.terminalOnly) stacks = stacks.filter((s) => isTerminal(s.StackStatus));

        const names = stacks.map((s) => opts.searchDeleted ? s.StackId : s.StackName);
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
