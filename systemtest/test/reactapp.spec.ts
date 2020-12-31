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

// tslint:disable: no-submodule-imports
import { expect } from "@adpt/cli/dist/test/common/fancy";
import { mkInstance } from "@adpt/cli/dist/test/common/start-minikube";
import { getNewDeployID } from "@adpt/cli/dist/test/common/testlib";
import { adaptDockerDeployIDKey } from "@adpt/cloud/dist/src/docker/labels";
import { buildKitHost } from "@adpt/cloud/dist/test/run_buildkit";
import { registryHost } from "@adpt/cloud/dist/test/run_registry";
import {
    describeLong,
    dockerutils,
    k8sutils,
} from "@adpt/testutils";
import { waitForNoThrow } from "@adpt/utils";
import execa from "execa";
import fs from "fs-extra";
import fetch from "node-fetch";
import path from "path";
import { curlOptions, systemAppSetup, systemTestChain } from "./common";

const { deleteAllContainers, deleteAllImages, deleteAllNetworks } = dockerutils;
const { deleteAll, getAll } = k8sutils;

function jsonEql(json: string, ref: any) {
    let obj: any;
    try {
        obj = JSON.parse(json);
    } catch (e) {
        throw new Error(json + "\n\n" + e.message);
    }
    expect(obj).eql(ref);
}

const origDockerHost = process.env.DOCKER_HOST;

async function dockerCurl(url: string) {
    const { stdout: resp } = await execa("docker", [
        "run", "--rm", "curlimages/curl",
        ...curlOptions,
        url,
    ], {
        all: true,
        env: { DOCKER_HOST: origDockerHost },
    });
    return resp;
}

async function localFetch(url: string) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Fetching url '${url}' failed: ${resp.statusText}`);
    return resp.text();
}

async function get(url: string) {
    const fetcher = url.startsWith("http://localhost:") ? localFetch : dockerCurl;
    const resp = await fetcher(url);
    if (!resp) throw new Error(`get returned no data`);
    return resp;
}

const deployIDFilter = (deployID: string) => `label=${adaptDockerDeployIDKey}=${deployID}`;

async function cleanupDocker(deployID: string | undefined) {
    if (!deployID) return;
    const filter = deployIDFilter(deployID);
    await deleteAllContainers(filter);
    await deleteAllImages(filter);
    await deleteAllNetworks(filter);
}

describeLong("reactapp system tests", function () {
    let kClient: k8sutils.KubeClient;
    let bkDeployID: string | undefined;
    let kDeployID: string | undefined;
    let lDeployID: string | undefined;
    let dockerHost: string;
    let dockerIP: string;
    let bkHost: string;
    let regHost: string;

    this.timeout(6 * 60 * 1000);

    systemAppSetup.all("reactapp");

    before(async function () {
        this.timeout(60 * 1000 + mkInstance.setupTimeoutMs);
        const results = await Promise.all([
            mkInstance.client,
            mkInstance.info,
            fs.outputJson(path.join("deploy", "kubeconfig.json"), await mkInstance.kubeconfig),
            buildKitHost(),
            registryHost(),
        ]);

        kClient = results[0];
        dockerHost = results[1].dockerHost;
        dockerIP = results[1].dockerIP;
        bkHost = results[3];
        regHost = results[4];
    });

    afterEach(async function () {
        this.timeout(65 * 1000);
        if (kDeployID && kClient) {
            await Promise.all([
                deleteAll("deployments", { client: kClient, deployID: kDeployID, apiPrefix: "apis/apps/v1" }),
            ]);
            kDeployID = undefined;
        }

        await cleanupDocker(lDeployID);
        await cleanupDocker(bkDeployID);
    });

    async function checkApi(host: string) {
        await waitForNoThrow(5, 2, async () => {
            const resp = await get(
                `http://${host}:8080/api/search/The%20Incredibles`);
            jsonEql(resp, [{
                title: "The Incredibles",
                released: "Fri Nov 05 2004"
            }]);
        });
    }

    async function checkRoot(host: string) {
        await waitForNoThrow(5, 2, async () => {
            const resp = await get(`http://${host}:8080/`);
            expect(resp).contains(`Unbounded Movie Database`);
        });
    }

    systemTestChain
    .delayedenv(() => ({
        DOCKER_HOST: dockerHost,
        KUBECONFIG: "./kubeconfig.json",
        // TODO: Fix style sheet so these aren't required
        BUILDKIT_HOST: bkHost,
        BUILDKIT_REGISTRY: regHost,
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
        expect(names).to.include.members([
            "nginx-url-router", "nginx-static", "db", "node-service"]);

        await checkApi(dockerIP);
        await checkRoot(dockerIP);
    });

    systemTestChain
    .delayedenv(() => ({
        BUILDKIT_HOST: bkHost,
        BUILDKIT_REGISTRY: regHost,
    }))
    .do(() => process.chdir("deploy"))
    .command(["run", "laptop"])

    .do(async ({ stdout, stderr }) => {
        lDeployID = getNewDeployID(stdout);

        expect(stderr).equals("");
        expect(stdout).contains("Validating project [completed]");
        expect(stdout).contains("Creating new project deployment [completed]");

        const ctrs = (await containerNames(lDeployID)).sort();
        expect(ctrs).has.length(4);
        expect(ctrs.shift()).matches(/^nodeservice-/);
        expect(ctrs.shift()).matches(/^postgres-testpostgres-/);
        expect(ctrs.shift()).matches(/^reactapp-/);
        expect(ctrs.shift()).matches(/^urlrouter-/);

        const urlRouterIp = await containerIP(/^urlrouter-/, lDeployID);
        if (!urlRouterIp) throw new Error(`Unable to find IP for URL Router`);

        await checkApi(urlRouterIp);
        await checkRoot(urlRouterIp);
    })
    .delayedcommand(() => ["destroy", lDeployID!])
    .it("Should deploy/destroy reactapp to local Docker host (laptop style)", async ({ stdout, stderr }) => {
        expect(stderr).equals("");
        expect(stdout).contains(`Deployment ${lDeployID} stopped successfully.`);
        const ctrs = await containerNames(lDeployID!);
        expect(ctrs).has.length(0);
    });

    if (process.platform !== "win32") {
        systemTestChain
        .delayedenv(() => ({
            BUILDKIT_HOST: bkHost,
            BUILDKIT_REGISTRY: regHost,
        }))
        .do(() => process.chdir("deploy"))
        .command(["run", "laptop-buildkit"])

        .it("Should deploy reactapp to local Docker host (laptop-buildkit style)", async ({ stdout, stderr }) => {
            bkDeployID = getNewDeployID(stdout);

            expect(stderr).equals("");
            expect(stdout).contains("Validating project [completed]");
            expect(stdout).contains("Creating new project deployment [completed]");

            const ctrs = (await containerNames(bkDeployID)).sort();
            expect(ctrs).has.length(4);
            expect(ctrs.shift()).matches(/^nodeservice-/);
            expect(ctrs.shift()).matches(/^postgres-testpostgres-/);
            expect(ctrs.shift()).matches(/^reactapp-/);
            expect(ctrs.shift()).matches(/^urlrouter-/);

            const urlRouterIp = await containerIP(/^urlrouter-/, bkDeployID);
            if (!urlRouterIp) throw new Error(`Unable to find IP for URL Router`);

            await checkApi(urlRouterIp);
            await checkRoot(urlRouterIp);
        });
    }
});

async function containerNames(deployID: string) {
    const filter = deployIDFilter(deployID);
    const { stdout: psOut } = await execa("docker", [
        "ps",
        "--format", "{{.Names}}",
        "--filter", filter
    ]);
    return psOut.split(/\s+/).filter(Boolean);
}

async function findContainer(nameRe: RegExp, deployID: string) {
    const ctrs = await containerNames(deployID);
    for (const ctr of ctrs) {
        if (ctr.match(nameRe)) return ctr;
    }
    return undefined;
}

async function containerIP(nameRe: RegExp, deployID: string) {
    if (!dockerutils.inContainer()) return "localhost";

    const name = await findContainer(nameRe, deployID);
    if (!name) return undefined;

    const { stdout } = await execa("docker", [
        "inspect", name,
        "-f", "{{ .NetworkSettings.IPAddress }}"
    ]);
    return stdout;
}
