/*
 * Copyright 2018-2019 Unbounded Systems, LLC
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

// tslint:disable: no-submodule-imports
import { expect } from "@adpt/cli/dist/test/common/fancy";
import { mkInstance } from "@adpt/cli/dist/test/common/start-minikube";
import { getNewDeployID, stdoutDivide, stdoutDivider } from "@adpt/cli/dist/test/common/testlib";
import {
    awsutils,
    describeLong,
    k8sutils,
} from "@adpt/testutils";
import { sleep } from "@adpt/utils";
import * as fs from "fs-extra";
import { systemAppSetup, systemTestChain } from "./common";

const { deleteAll, getAll } = k8sutils;
const {
    checkStackStatus,
    deleteAllStacks,
    getAwsClient,
    getStacks,
} = awsutils;

// FIXME(mark): The following line needs to be a require because importing
// the types from adapt currently causes a compile error due to adapt
// not having strictFunctionTypes=true
// FIXME(mark): The following line does a deep submodule import to avoid
// triggering the AWS plugin to register. The modules should probably be
// reorganized to better allow this import.
// tslint:disable-next-line:no-submodule-imports no-var-requires
const awsCredentials = require("@adpt/cloud/dist/src/aws/credentials");
const { loadAwsCreds } = awsCredentials;

const newDeployRegex = /Deployment created successfully. DeployID is: (.*)$/m;

// NOTE(mark): These tests use the same project directory to deploy multiple
// times, both to test that functionality and to reduce setup runtime (mostly
// from NPM).
describeLong("Nodecellar system tests", function () {
    let kClient: k8sutils.KubeClient;
    let aClient: AWS.CloudFormation;
    let kDeployID: string | undefined;
    let aDeployID: string | undefined;

    this.timeout(6 * 60 * 1000);

    systemAppSetup.all("nodecellar");

    before(async function () {
        this.timeout(60 * 1000 + mkInstance.setupTimeoutMs);
        const results = await Promise.all([
            mkInstance.client,
            loadAwsCreds(),
            fs.outputJson("kubeconfig.json", await mkInstance.kubeconfig),
        ]);

        kClient = results[0];
        aClient = getAwsClient(results[1]);
    });

    afterEach(async function () {
        this.timeout(65 * 1000);
        if (kDeployID && kClient) {
            await Promise.all([
                deleteAll("pods", { client: kClient, deployID: kDeployID }),
                deleteAll("services", { client: kClient, deployID: kDeployID }),
            ]);
            kDeployID = undefined;
        }
        if (aDeployID && aClient) {
            await deleteAllStacks(aClient, aDeployID, 60 * 1000, false);
            aDeployID = undefined;
        }
    });

    systemTestChain
    .command(["run", "k8s"])

    .it("Should deploy k8s style", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        expect(ctx.stdout).does.not.contain("WARNING");

        const matches = ctx.stdout.match(newDeployRegex);
        expect(matches).to.be.an("array").with.length(2);
        if (matches && matches[1]) kDeployID = matches[1];
        expect(kDeployID).to.be.a("string").with.length.greaterThan(0);

        let pods: any;
        let i: number;
        for (i = 120; i > 0; i--) {
            pods = await getAll("pods", { client: kClient, deployID: kDeployID });
            expect(pods).to.have.length(1);
            expect(pods[0] && pods[0].status).to.be.an("object").and.not.null;

            // containerStatuses can take a moment to populate
            if (pods[0].status.containerStatuses) {
                expect(pods[0].status.containerStatuses).to.be.an("array").with.length(2);
                if ((pods[0].status.phase === "Running") &&
                    (pods[0].status.containerStatuses[0].ready) &&
                    (pods[0].status.containerStatuses[1].ready)) {
                    break;
                }
            }
            await sleep(1000);
        }
        if (i <= 0) throw new Error(`Pods did not become ready`);
        expect(pods[0].spec.containers).to.have.length(2);

        // TODO: Should be able to curl the web interface and get HTML
    });

    systemTestChain

    .command(["run", "aws"])
    .do(async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");
        // TODO(mark): This test currently currently generates a warning
        // for the LocalContainer and LocalDockerHost elements not being
        // claimed by plugins. Uncomment this when fixed.
        //expect(ctx.stdout).does.not.contain("WARNING");

        aDeployID = getNewDeployID(ctx.stdout);

        stdoutDivider();
    })

    .delayedcommand(() => ["status", "-q", aDeployID!])

    .it("Should deploy AWS style", async (ctx) => {
        expect(ctx.stderr).equals("");

        const chunks = stdoutDivide(ctx.stdout);
        expect(chunks).to.have.length(2);

        // Remove first line of output
        const status = chunks[1].replace(`Deployment ${aDeployID} status:`, "");

        const statObj = JSON.parse(status);
        const stackId = statObj.StackId;
        expect(stackId).to.be.a("string", "StackId of status is not a string");

        const stacks = await getStacks(aClient, aDeployID, stackId);
        expect(stacks).to.have.length(1);
        await checkStackStatus(stacks[0], "CREATE_COMPLETE", true, aClient);

        // TODO: Should be able to curl the web interface and get HTML
    });
});
