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

import { waitFor } from "@adpt/utils";
import Docker = require("dockerode");
import * as jsYaml from "js-yaml";
import * as ld from "lodash";
import moment from "moment";
import { URL } from "url";
import * as util from "util";
import {
    addToNetwork,
    createNetwork,
    dockerExec,
    dockerPull,
    getNetwork,
    getSelfContainer,
    removeFromNetwork,
} from "./dockerutils";

// tslint:disable-next-line:no-var-requires
const stripAnsi = require("strip-ansi");

export interface MinikubeInfo {
    docker: Docker;
    dockerHost: string;
    dockerIP: string;
    container: Docker.Container;
    hostname: string;
    network: Docker.Network | null;
    kubeconfig: object;
    stop: () => Promise<void>;
    exec: (command: string[]) => Promise<string>;
}

async function getKubeconfig(_docker: Docker, container: Docker.Container,
    hostname: string, containerAlias?: string | undefined,
    portAlias?: number): Promise<object> {

    if (!containerAlias) containerAlias = hostname;
    const configYAML = await dockerExec(container, ["cat", "/kubeconfig"]);

    const kubeconfig = jsYaml.safeLoad(configYAML);
    if (!kubeconfig || typeof kubeconfig !== "object") {
        throw new Error(`Invalid kubeconfig\n ${configYAML}\n\n${util.inspect(kubeconfig)}`);
    }
    const clusters: any[] = (kubeconfig as any).clusters;
    if (!ld.isArray(clusters)) {
        throw new Error(`Invalid kubeconfig\n ${configYAML}\n\n${util.inspect(kubeconfig)}`);
    }
    for (const cluster of clusters) {
        // Ensure kubeconfig's servers use the preferred alias/port, regardless
        // of which of these names it originally used in the config.
        const url = new URL(cluster.cluster.server);
        url.host = containerAlias;
        if (portAlias) url.port = portAlias.toString();
        cluster.cluster.server = url.href;
    }

    return kubeconfig;
}

async function runMinikubeContainer(
    docker: Docker,
    containerName: string,
    networkName: string | null) {

    const imageName = "unboundedsystems/k3s-dind";
    const imageTag = "1.18.4-k3s1";
    const image = `${imageName}:${imageTag}`;

    const opts: Docker.ContainerCreateOptions = {
        name: containerName,
        AttachStdin: false,
        AttachStdout: false,
        AttachStderr: false,
        Hostname: containerName,
        Tty: false,
        OpenStdin: false,
        StdinOnce: false,
        HostConfig: {
            AutoRemove: true,
            Privileged: true
        },
        Env: [],
        Image: image,
        Volumes: {},
    };

    if (networkName) {
        opts.HostConfig!.NetworkMode = networkName;
        opts.NetworkingConfig = {
            EndpointsConfig: {
                [networkName]: { }
            }
        };
    } else {
        opts.HostConfig!.PublishAllPorts = true;
    }

    await dockerPull(docker, image, "      ");
    const container = await docker.createContainer(opts);

    // If we attached to a non-bridge network, also
    // attach to the outside world so minikube can check for image updates.
    // minikube 0.25.0 fails to start if it can't check.
    // NOTE(mark): Should be able to attach to bridge in the create opts
    // above, I think, but I get errors when I do it that way. Someone
    // just needs to find the right incantation...
    if (networkName) {
        const bridge = docker.getNetwork("bridge");
        await addToNetwork(container, bridge);
    }

    await container.start();
    return container;
}

async function waitForKubeConfig(docker: Docker, container: Docker.Container,
    hostname: string, containerAlias: string | undefined,
    portAlias: number | undefined): Promise<object | undefined> {
    let config: object | undefined;
    await waitFor(100, 1, "Timed out waiting for kubeconfig", async () => {
        try {
            // When this command stops returning an error, /kubeconfig is
            // fully written.
            await dockerExec(container, ["cat", "/minikube_startup_complete"]);
            config = await getKubeconfig(docker, container, hostname, containerAlias, portAlias);
            return true;
        } catch (err) {
            if (/exited with error/.test(err.message) ||
                /Invalid kubeconfig/.test(err.message)) return false;
            throw err;
        }
    });
    return config;
}

async function waitForMiniKube(container: Docker.Container) {
    await waitFor(100, 1, "Timed out waiting for Minikube", async () => {
        try {
            const statusColor = await dockerExec(container, ["kubectl", "cluster-info"]);
            const status = stripAnsi(statusColor) as string;
            if (! /^Kubernetes master is running at/.test(status)) {
                return false;
            }

            const accts = await dockerExec(container, ["kubectl", "get", "serviceaccounts"]);
            if (! /^default\s/m.test(accts))  return false;

            const systemPods = await dockerExec(container, [
                "kubectl", "get", "pods", "--namespace=kube-system",
            ]);
            if (!systemPods) return false;
            const lines = systemPods.split("\n");
            // header + at least one pod + newline
            if (lines.length < 3) return false;

            return true;
        } catch (err) {
            if (! /exited with error/.test(err.message)) throw err;
        }
        return false;
    });
}

function secondsSince(start: number): number {
    return (Date.now() - start) / 1000;
}

function getHostPort(info: Docker.ContainerInspectInfo, p: number) {
    const list = info.NetworkSettings.Ports[`${p}/tcp`];
    if (!list || list.length === 0) throw new Error(`Port ${p} is not bound`);

    const hp = parseInt(list[0].HostPort, 10);
    if (isNaN(hp)) throw new Error(`HostPort is not an integer`);

    return hp;
}

export async function startTestMinikube(): Promise<MinikubeInfo> {
    const stops: (() => Promise<void>)[] = [];
    async function stop() {
        for (const f of stops) {
            await f();
        }
    }

    const startTime = Date.now();
    let kubeconfig: object | undefined;

    try {
        // Connects to DOCKER_HOST or the default UNIX socket or Windows pipe
        // if DOCKER_HOST is not set.
        const docker = new Docker();
        // If this code is not running in a container, self === null
        const self = await getSelfContainer(docker);
        let container: Docker.Container;
        let network: Docker.Network | null = null;
        let hostname: string;
        let apiPort = 8443;
        let dockerPort = 2375;
        let info: Docker.ContainerInspectInfo | undefined;

        if (process.env.ADAPT_TEST_K8S) {
            hostname = process.env.ADAPT_TEST_K8S;
            container = docker.getContainer(hostname);
            network = await getNetwork(docker, container);
            kubeconfig = await getKubeconfig(docker, container, hostname);
        } else {
            // tslint:disable-next-line:no-console
            console.log(`    Starting Minikube`);
            const tstamp = moment().format("MMDD-HHmm-ss-SSSSSS");
            hostname = `test-k8s-${process.pid}-${tstamp}`;
            if (self) {
                network = await createNetwork(docker, hostname);
                if (network.id === undefined) throw new Error("Network id was undefined!");
                stops.unshift(async () => network && network.remove());
            }
            container = await runMinikubeContainer(docker, hostname, network && network.id);
            stops.unshift(async () => container.stop());

            const hostAlias = self ? undefined : "localhost";

            if (!self) {
                info = await container.inspect();
                apiPort = getHostPort(info, apiPort);
                dockerPort = getHostPort(info, dockerPort);
            }

            kubeconfig = await waitForKubeConfig(docker, container, hostname, hostAlias, apiPort);
            if (hostAlias) hostname = hostAlias;
            const configTime = secondsSince(startTime);
            // tslint:disable-next-line:no-console
            console.log(`    Got kubeconfig (${configTime} seconds)`);
        }

        if (!kubeconfig) throw new Error("Internal Error: should be unreachable");

        await waitForMiniKube(container);
        const totalTime = secondsSince(startTime);
        // tslint:disable-next-line:no-console
        console.log(`\n    Minikube ready in ${totalTime} seconds`);

        if (self && network) await addToNetwork(self, network);

        // If it's a shared minikube, we don't have an in-use count, so just
        // leave self connected.
        if (!process.env.ADAPT_TEST_K8S) {
            stops.unshift(async () => {
                if (self && network) await removeFromNetwork(self, network);
            });
        }

        if (!info) info = await container.inspect();
        const dockerIP = info.NetworkSettings.IPAddress;

        const dockerHost = `tcp://${hostname}:${dockerPort}`;

        const exec = (command: string[]) => dockerExec(container, command);
        return {
            container,
            docker,
            dockerHost,
            dockerIP,
            exec,
            hostname,
            kubeconfig,
            network,
            stop,
        };
    } catch (e) {
        await stop();
        throw e;
    }
}

export async function stopTestMinikube(info: MinikubeInfo): Promise<void> {
    await info.stop();
}
