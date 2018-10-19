import * as uutils from "@usys/utils";
import Docker = require("dockerode");
import * as sb from "stream-buffers";
import * as util from "util";

export async function dockerExec(container: Docker.Container, command: string[]): Promise<string> {
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

export async function dockerPull(docker: Docker, imageName: string, indent = ""): Promise<void> {
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

export async function getNetwork(docker: Docker, container: Docker.Container) {
    const info = await container.inspect();
    const networkName = Object.keys(info.NetworkSettings.Networks)[0];
    return docker.getNetwork(networkName);
}

export async function createNetwork(docker: Docker, name: string): Promise<Docker.Network> {
    return docker.createNetwork({ Name: name });
}

export async function addToNetwork(container: Docker.Container, network: Docker.Network) {
    await network.connect({ Container: container.id });
}

export async function removeFromNetwork(container: Docker.Container, network: Docker.Network) {
    await network.disconnect({ Container: container.id });
}

export async function waitFor(
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

export function secondsSince(start: number): number {
    return (Date.now() - start) / 1000;
}
