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

// tslint:disable: no-submodule-imports
import { expect } from "@adpt/cli/dist/test/common/fancy";
import { mkInstance } from "@adpt/cli/dist/test/common/start-minikube";
import { getNewDeployID } from "@adpt/cli/dist/test/common/testlib";
import { adaptDockerDeployIDKey } from "@adpt/cloud/dist/src/docker/labels";
import {
    describeLong,
    dockerutils,
    k8sutils,
} from "@adpt/testutils";
import { waitForNoThrow } from "@adpt/utils";
import execa from "execa";
import fs from "fs-extra";
import path from "path";
import { curlOptions, systemAppSetup, systemTestChain } from "./common";

const { deleteAllContainers, deleteAllImages, deleteAllNetworks } = dockerutils;
const { deleteAll, getAll } = k8sutils;

function isPodReady(pod: any) {
    expect(pod && pod.status).to.be.an("object").and.not.null;

    // containerStatuses can take a moment to populate
    if (!pod.status.containerStatuses) return false;
    expect(pod.status.containerStatuses).to.be.an("array").with.length(1);
    return ((pod.status.phase === "Running") &&
        pod.status.containerStatuses[0].ready);
}

function jsonEql(json: string, ref: any) {
    let obj: any;
    try {
        obj = JSON.parse(json);
    } catch (e) {
        throw new Error(json + "\n\n" + e.message);
    }
    expect(obj).eql(ref);
}

describeLong("reactapp system tests", function () {
    let kClient: k8sutils.KubeClient;
    let kDeployID: string | undefined;
    let lDeployID: string | undefined;
    let dockerHost: string;

    this.timeout(6 * 60 * 1000);

    systemAppSetup.all("reactapp");

    const deployIDFilter = () => `label=${adaptDockerDeployIDKey}=${lDeployID}`;

    before(async function () {
        this.timeout(60 * 1000 + mkInstance.setupTimeoutMs);
        const results = await Promise.all([
            mkInstance.client,
            mkInstance.info,
            fs.outputJson(path.join("deploy", "kubeconfig.json"), await mkInstance.kubeconfig),
        ]);

        kClient = results[0];
        const ctrInfo = await results[1].container.inspect();
        dockerHost = ctrInfo.Name;
        if (dockerHost.startsWith("/")) dockerHost = dockerHost.slice(1);
        if (!dockerHost) {
            // tslint:disable-next-line:no-console
            console.log(`Minikube ctrInfo`, ctrInfo);
            throw new Error(`Error getting minikube endpoint`);
        }
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

        if (lDeployID) {
            const filter = deployIDFilter();
            await deleteAllContainers(filter, { dockerHost });
            await deleteAllImages(filter, { dockerHost });
            await deleteAllNetworks(filter, { dockerHost });
        }
    });

    async function checkApi() {
        await waitForNoThrow(5, 2, async () => {
            const { stdout: resp } = await execa("curl", [
                ...curlOptions,
                `http://${dockerHost}:8080/api/search/The%20Incredibles`
            ]);
            jsonEql(resp, [{
                title: "The Incredibles",
                released: "Fri Nov 05 2004"
            }]);
        });
    }

    async function checkRoot() {
        await waitForNoThrow(5, 2, async () => {
            const { stdout: resp } = await execa("curl", [
                ...curlOptions,
                `http://${dockerHost}:8080/`
            ]);
            expect(resp).contains(`Unbounded Movie Database`);
        });
    }

    systemTestChain
    .delayedenv(() => ({
        DOCKER_HOST: dockerHost,
        KUBECONFIG: "./kubeconfig.json",
    }))
    .do(() => process.chdir("deploy"))
    .command(["run", "k8s"])

    .it("Should deploy reactapp to k8s", async ({ stdout, stderr }) => {
        kDeployID = getNewDeployID(stdout);

        expect(stderr).equals("");
        expect(stdout).contains("Validating project [completed]");
        expect(stdout).contains("Creating new project deployment [completed]");

        const pods = await getAll("pods", { client: kClient, deployID: kDeployID });
        const names = pods.map((p) => p.spec.containers[0].name);
        expect(names).to.have.members([
            "nginx-url-router", "nginx-static", "db", "node-service"]);
        pods.forEach((p: any) => {
            if (!isPodReady(p)) throw new Error(`Pods not ready`);
        });

        await checkApi();
        await checkRoot();
    });

    systemTestChain
    .delayedenv(() => ({ DOCKER_HOST: dockerHost }))
    .do(() => process.chdir("deploy"))
    .command(["run", "laptop"])

    .it("Should deploy reactapp to local Docker host (laptop style)", async ({ stdout, stderr }) => {
        lDeployID = getNewDeployID(stdout);

        expect(stderr).equals("");
        expect(stdout).contains("Validating project [completed]");
        expect(stdout).contains("Creating new project deployment [completed]");

        const filter = deployIDFilter();
        const { stdout: psOut } = await execa("docker", [
            "ps",
            "--format", "{{.Names}}",
            "--filter", filter
        ]);
        const ctrs = psOut.split(/\s+/).sort();
        expect(ctrs).has.length(4);
        expect(ctrs.shift()).matches(/^nodeservice-/);
        expect(ctrs.shift()).matches(/^postgres-testpostgres-/);
        expect(ctrs.shift()).matches(/^reactapp-/);
        expect(ctrs.shift()).matches(/^urlrouter-/);

        await checkApi();
        await checkRoot();
    });
});
