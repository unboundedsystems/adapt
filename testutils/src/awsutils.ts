/*
 * Copyright 2018-2020 Unbounded Systems, LLC
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

import { ciMaybeCreateLogger, ciReportEnabled, makeRetryDelay, removeUndef, sleep } from "@adpt/utils";
import AWS = require("aws-sdk");
import { isNumber, xor } from "lodash";
import should from "should";
import { inspect } from "util";

if (ciReportEnabled() && !AWS.config.logger) {
    const logger = ciMaybeCreateLogger("aws-sdk");
    if (logger) AWS.config.logger = logger;
}

const customBackoff = makeRetryDelay();
AWS.config.update({
    maxRetries: 20,
    retryDelayOptions: { customBackoff },
});

interface AwsCredentials {
    awsAccessKeyId: string;
    awsSecretAccessKey: string;
    awsRegion: string;
}

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

export async function fakeCreds(): Promise<AwsCredentials> {
    return {
        awsAccessKeyId: "fakeKeyID",
        awsSecretAccessKey: "fakeSecret",
        awsRegion: "us-west-2",
    };
}

export function getAwsClient(creds: AwsCredentials) {
    return new AWS.CloudFormation({
        region: creds.awsRegion,
        accessKeyId: creds.awsAccessKeyId,
        secretAccessKey: creds.awsSecretAccessKey,
    });
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

interface Tagged {
    Tags?: AWS.CloudFormation.Tag[];
}

function getTag(obj: Tagged, tag: string) {
    if (obj.Tags) {
        for (const t of obj.Tags) {
            if (t.Key === tag) return t.Value;
        }
    }
    return undefined;
}

function getAdaptDeployId(stack: AWS.CloudFormation.Stack) {
    return getTag(stack, "adapt:deployID");
}

function stacksWithDeployID(
    stacks: AWS.CloudFormation.Stack[] | undefined,
    deployID: string): AWS.CloudFormation.Stack[] {
    if (stacks == null) return [];
    return stacks.filter((s) => (getAdaptDeployId(s) === deployID));
}

export async function getStacks(client: AWS.CloudFormation, deployID?: string,
                                stackName?: string) {
    const resp = stackName ?
        await client.describeStacks({ StackName: stackName }).promise() :
        await client.describeStacks().promise();
    if (deployID !== undefined) return stacksWithDeployID(resp.Stacks, deployID);
    return resp.Stacks || [];
}

export interface DeleteOptions {
    definite?: boolean;
    pollMs?: number;
    timeoutMs?: number;
}

const deleteDefaults = {
    definite: true,
    pollMs: 1000,
    timeoutMs: 20 * 1000,
};

export async function deleteAllStacks(client: AWS.CloudFormation, deployID: string,
                                      options: DeleteOptions): Promise<void>;
export async function deleteAllStacks(client: AWS.CloudFormation, deployID: string,
                                      timeoutMs?: number, definite?: boolean): Promise<void>;
export async function deleteAllStacks(client: AWS.CloudFormation, deployID: string,
                                      timeoutOrOptions?: number | DeleteOptions,
                                      definite?: boolean): Promise<void> {
    const inOpts = timeoutOrOptions === undefined ? {} :
        isNumber(timeoutOrOptions) ? removeUndef({ timeoutMs: timeoutOrOptions, definite }) :
        timeoutOrOptions;
    const opts = { ...deleteDefaults, ...inOpts };
    let timeoutMs = opts.timeoutMs;

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

        await sleep(opts.pollMs);
        timeoutMs -= opts.pollMs;
    } while (timeoutMs > 0);
    throw new Error(`Unable to delete stacks`);
}

type StatusFilter = (status: AWS.CloudFormation.StackStatus) => boolean;

export interface WaitOptions {
    pollMs?: number;
    timeoutMs?: number;
    terminalOnly?: boolean;
    searchDeleted?: boolean;
    statusFilter?: StatusFilter;
}
const waitDefaults = {
    pollMs: 2000,
    timeoutMs: 30 * 1000,
    terminalOnly: true,
    searchDeleted: false,
    statusFilter: undefined,
};

export async function waitForStacks(client: AWS.CloudFormation, deployID: string,
                                    stackNames: string[], options?: WaitOptions) {
    const { pollMs, statusFilter, ...opts } = { ...waitDefaults, ...options };
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
        await sleep(pollMs);
        timeoutMs -= pollMs;
    } while (timeoutMs > 0);
    throw new Error(`Timeout waiting for stacks. Expected: ${inspect(stackNames)} Actual: ${inspect(actual)}`);
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
