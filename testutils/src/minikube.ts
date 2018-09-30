import * as uutils from "@usys/utils";
import Docker = require("dockerode");
import * as fs from "fs";
import * as jsYaml from "js-yaml";
import * as ld from "lodash";
import * as moment from "moment";
import * as sb from "stream-buffers";
import * as util from "util";

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

async function dockerExec(container: Docker.Container, command: string[]): Promise<string> {
    const exec = await container.exec({
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: false,
        Cmd: command
    });

    const info = await exec.start();
    const buf = new sb.WritableStreamBuffer();
    const errBuf = new sb.WritableStreamBuffer();
    info.modem.demuxStream(info.output, buf, errBuf);
    return new Promise<string>((res, rej) => {
        info.output.on("end", async () => {
            const inspectInfo = await exec.inspect();
            if (inspectInfo.Running !== false) {
                rej(new Error(`dockerExec: ${util.inspect(command)} stream ended with process still running?!`));
                return;
            }
            if (inspectInfo.ExitCode !== 0) {
                // tslint:disable-next-line:max-line-length
                const msg = `dockerExec: ${util.inspect(command)} process exited with error (code: ${inspectInfo.ExitCode})`;
                rej(new Error(msg));
                return;
            }
            res(buf.getContentsAsString());
        });
    });
}

async function dockerPull(docker: Docker, imageName: string, indent = ""): Promise<void> {
    // tslint:disable:no-console
    function printStatus(data: unknown) {
        if (!(data instanceof Buffer)) throw new Error(`Unknown status: ${data}`);
        const msg = JSON.parse(data.toString());
        let s = msg.status;
        if (!s) {
            console.log(`${indent}Docker pull status:`, msg);
            return;
        }
        if (msg.id) s += ` id=${msg.id}`;
        console.log(`${indent}  ${s}`);
    }

    // tslint:disable-next-line:no-console
    console.log(`${indent}Pulling docker image ${imageName}`);

    return new Promise<void>((res, rej) => {

        function mkErr(e: any) {
            const msg = `Error pulling image: ${e}`;
            console.log(`${indent}${msg}`);
            rej(new Error(msg));
        }

        // NOTE(mark): tslint incorrectly complains about an unhandled
        // promise from docker.pull on the line below, but the callback
        // version of pull does not return a promise.
        // tslint:disable-next-line:no-floating-promises
        docker.pull(imageName, (err: any, stream: any) => {
            if (err) return mkErr(err);
            stream.on("error", (e: any) => {
                return mkErr(e);
            });

            stream.on("data", (data: any) => {
                try {
                    printStatus(data);
                } catch (e) {
                    return mkErr(e);
                }
            });
            stream.on("end", () => {
                console.log(`${indent}Pull complete`);
                res();
            });
        });
    });

    // tslint:enable:no-console
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

async function waitFor(
    iterations: number,
    pollSec: number,
    timeoutMsg: string,
    action: () => Promise<boolean>): Promise<void> {

    for (let i = 0; i < iterations; i++) {
        if (await action()) return;
        await uutils.sleep(pollSec * 1000);
    }
    throw new Error(timeoutMsg);
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

        stops.unshift(async () => removeFromNetwork(self, network));

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
