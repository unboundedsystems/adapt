import { waitFor } from "@usys/utils";
import Docker = require("dockerode");
import * as jsYaml from "js-yaml";
import * as ld from "lodash";
import moment from "moment";
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
    container: Docker.Container;
    network: Docker.Network;
    kubeconfig: object;
    stop: () => Promise<void>;
    exec: (command: string[]) => Promise<string>;
}

async function getKubeconfig(_docker: Docker, container: Docker.Container,
    containerAlias: string): Promise<object> {
    const configYAML = await dockerExec(container, ["cat", "/kubeconfig"]);

    const kubeconfig = jsYaml.safeLoad(configYAML);
    if (!ld.isArray(kubeconfig.clusters)) {
        throw new Error(`Invalid kubeconfig\n ${configYAML}\n\n${util.inspect(kubeconfig)}`);
    }
    for (const cluster of kubeconfig.clusters) {
        const server = (cluster.cluster.server as string);
        // If minikube decides to listen on localhost, translate that to
        // the DNS name/alias that the container is known as. This no longer
        // tends to happen in our own tests after upgrading to minikube
        // 0.25.0 (mk listens on a docker-created IP instead), but this
        // catches the case if/when it does.
        cluster.cluster.server = server.replace("localhost", containerAlias);
        cluster.cluster.server = server.replace("127.0.0.1", containerAlias);
    }

    return kubeconfig;
}

async function runMinikubeContainer(
    docker: Docker,
    containerName: string,
    networkName: string) {

    const imageName = "unboundedsystems/minikube-dind";
    const imageTag = "v0.25.0-1";
    const image = `${imageName}:${imageTag}`;

    const opts: Docker.ContainerCreateOptions = {
        name: containerName,
        // --apiserver-names supported in minikube > v0.25.0
        Cmd: [ `--apiserver-names=${containerName}` ],
        AttachStdin: false,
        AttachStdout: false,
        AttachStderr: false,
        Tty: false,
        OpenStdin: false,
        StdinOnce: false,
        HostConfig: {
            AutoRemove: true,
            NetworkMode: networkName,
            Privileged: true
        },
        NetworkingConfig: {
            EndpointsConfig: {
                [networkName]: {
                    Aliases: [containerName]
                }
            }
        },
        Env: [],
        Image: image,
        Volumes: {},
    };

    await dockerPull(docker, image, "      ");
    const container = await docker.createContainer(opts);

    // Attach to the outside world so minikube can check for image updates.
    // minikube 0.25.0 fails to start if it can't check.
    // NOTE(mark): Should be able to attach to bridge in the create opts
    // above, I think, but I get errors when I do it that way. Someone
    // just needs to find the right incantation...
    const bridge = docker.getNetwork("bridge");
    await addToNetwork(container, bridge);

    return container.start();
}

async function waitForKubeConfig(docker: Docker, container: Docker.Container,
    containerAlias: string): Promise<object | undefined> {
    let config: object | undefined;
    await waitFor(100, 1, "Timed out waiting for kubeconfig", async () => {
        try {
            // When this command stops returning an error, /kubeconfig is
            // fully written.
            await dockerExec(container, ["cat", "/minikube_startup_complete"]);
            config = await getKubeconfig(docker, container, containerAlias);
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
            if (/^default\s/m.test(accts)) {
                return true;
            }
        } catch (err) {
            if (! /exited with error/.test(err.message)) throw err;
        }
        return false;
    });
}

function secondsSince(start: number): number {
    return (Date.now() - start) / 1000;
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
        const docker = new Docker({ socketPath: "/var/run/docker.sock" });
        const self = await getSelfContainer(docker);
        let container: Docker.Container;
        let network: Docker.Network;

        if (process.env.ADAPT_TEST_MINIKUBE) {
            container = docker.getContainer(process.env.ADAPT_TEST_MINIKUBE);
            network = await getNetwork(docker, container);
            kubeconfig = await getKubeconfig(docker, container, "kubernetes");
        } else {
            // tslint:disable-next-line:no-console
            console.log(`    Starting Minikube`);
            const tstamp = moment().format("MMDD-HHmm-ss-SSSSSS");
            const newContainerName = `test_minikube_${process.pid}_${tstamp}`;
            network = await createNetwork(docker, newContainerName);
            stops.unshift(async () => network.remove());
            if (network.id === undefined) throw new Error("Network id was undefined!");
            container = await runMinikubeContainer(docker, newContainerName, network.id);
            stops.unshift(async () => container.stop());

            kubeconfig = await waitForKubeConfig(docker, container, newContainerName);
            const configTime = secondsSince(startTime);
            // tslint:disable-next-line:no-console
            console.log(`    Got kubeconfig (${configTime} seconds)`);
        }

        if (!kubeconfig) throw new Error("Internal Error: should be unreachable");

        await waitForMiniKube(container);
        const totalTime = secondsSince(startTime);
        // tslint:disable-next-line:no-console
        console.log(`\n    Minikube ready in ${totalTime} seconds`);

        await addToNetwork(self, network);

        // If it's a shared minikube, we don't have an in-use count, so just
        // leave self connected.
        if (!process.env.ADAPT_TEST_MINIKUBE) {
            stops.unshift(async () => removeFromNetwork(self, network));
        }

        const exec = (command: string[]) => dockerExec(container, command);
        return { docker, container, network, kubeconfig, stop, exec };
    } catch (e) {
        await stop();
        throw e;
    }
}

export async function stopTestMinikube(info: MinikubeInfo): Promise<void> {
    await info.stop();
}
