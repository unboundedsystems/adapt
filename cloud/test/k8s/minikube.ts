import * as uutils from "@usys/utils";
import * as jsYaml from "js-yaml";

import Docker = require("dockerode");
import * as fs from "fs";
import * as ld from "lodash";
import * as sb from "stream-buffers";

export interface MinikubeInfo {
    docker: Docker;
    container: Docker.Container;
    network: Docker.Network;
    kubeconfig: object;
    stop: () => Promise<void>;
}

async function getKubeconfig(_docker: Docker, container: Docker.Container): Promise<object> {
    const exec = await container.exec({
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: false,
        Cmd: ["cat", "/kubeconfig"]
    });

    const info = await exec.start();
    const buf = new sb.WritableStreamBuffer();
    const errBuf = new sb.WritableStreamBuffer();
    info.modem.demuxStream(info.output, buf, errBuf);
    const configYAML = await new Promise<string>((res, rej) => {
        info.output.on("end", async () => {
            const inspectInfo = await exec.inspect();
            if (inspectInfo.Running !== false) {
                rej(new Error(`getKubeConfig: stream ended with process still running?!`));
            }
            if (inspectInfo.ExitCode !== 0) {
                rej(new Error(`getKubeConfig: process exited with error (code: ${inspectInfo.ExitCode}`));
            }
            res(buf.getContentsAsString());
        });
    });

    const kubeconfig = jsYaml.safeLoad(configYAML);
    for (const cluster of kubeconfig.clusters) {
        const server = (cluster.cluster.server as string);
        cluster.cluster.server = server.replace("localhost", "kubernetes");
        cluster.cluster.server = server.replace("127.0.0.1", "kubernetes");
    }

    return kubeconfig;
}

async function getSelfContainer(docker: Docker): Promise<Docker.Container> {
    const entries = fs.readFileSync("/proc/self/cgroup").toString().split(/\r?\n/);
    if (entries.length === 0) throw new Error("Cannot get own container id!");
    const entry = entries[0];
    const [, , path] = entry.split(":");
    const psplit = path.split("/");
    const id = ld.last(psplit);
    if (id === undefined) throw new Error("Cannot get own container id!");
    return docker.getContainer(id);
}

async function runMinikubeContainer(
    docker: Docker,
    containerName: string,
    networkName: string) {

    const opts: Docker.ContainerCreateOptions = {
        name: containerName,
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
                    Aliases: ["kubernetes"]
                }
            }
        },
        Env: [],
        Image: "quay.io/aspenmesh/minikube-dind",
        Volumes: {},
    };

    const container = await docker.createContainer(opts);
    return container.start();
}

async function getNetwork(docker: Docker, container: Docker.Container) {
    const info = await container.inspect();
    const networkName = Object.keys(info.NetworkSettings.Networks)[0];
    return docker.getNetwork(networkName);
}

async function createNetwork(docker: Docker, name: string): Promise<Docker.Network> {
    return docker.createNetwork({ Name: name });
}

async function addToNetwork(container: Docker.Container, network: Docker.Network) {
    await network.connect({ Container: container.id });
}

async function removeFromNetwork(container: Docker.Container, network: Docker.Network) {
    await network.disconnect({ Container: container.id });
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
            kubeconfig = await getKubeconfig(docker, container);
        } else {
            // tslint:disable-next-line:no-console
            console.log(`    Starting Minikube`);
            const newContainerName = `test_minikube_${self.id}_${process.pid}`;
            network = await createNetwork(docker, newContainerName);
            stops.unshift(async () => network.remove());
            if (network.id === undefined) throw new Error("Network id was undefined!");
            container = await runMinikubeContainer(docker, newContainerName, network.id);
            stops.unshift(async () => container.stop());

            // Wait for the container to be ready
            for (let i = 0; i < 20; i++) {
                await uutils.sleep(10000);  // 10 sec polling
                try {
                    kubeconfig = await getKubeconfig(docker, container);
                } catch (err) {
                    if (! /exited with error/.test(err.message)) throw err;
                }
            }
            if (!kubeconfig) {
                throw new Error(`Timed out waiting for kubeconfig`);
            }
            const elapsed = (Date.now() - startTime) / 1000;
            // tslint:disable-next-line:no-console
            console.log(`\n    Minikube started in ${elapsed} seconds`);
        }

        await addToNetwork(self, network);

        stops.unshift(async () => removeFromNetwork(self, network));

        return { docker, container, network, kubeconfig, stop };
    } catch (e) {
        await stop();
        throw e;
    }
}

export async function stopTestMinikube(info: MinikubeInfo): Promise<void> {
    await info.stop();
}
