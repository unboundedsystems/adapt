import Docker = require("dockerode");
import * as fs from "fs";
import ld from "lodash";
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
        const prog = msg.progressDetail;
        if (prog && prog.current != null) s += ` Progress: ${prog.current}/${prog.total}`;
        console.log(`${indent}  ${s}`);
    }

    if (!imageName.includes(":")) {
        throw new Error(`dockerPull: imageName must include tag or be an ID`);
    }

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

export async function deleteContainer(docker: Docker, name: string) {
    let ctr: Docker.Container;
    try {
        ctr = docker.getContainer(name);
    } catch (e) { return; }
    try {
        await ctr.stop();
    } catch (e) { /**/ }
    try {
        await ctr.remove();
    } catch (e) { /**/ }
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
    try {
        await network.connect({ Container: container.id });
    } catch (e) {
        if (!(typeof e.message === "string" &&
            e.message.includes("already exists in network"))) {
            throw e;
        }
    }
}

export async function removeFromNetwork(container: Docker.Container, network: Docker.Network) {
    await network.disconnect({ Container: container.id });
}

export async function getSelfContainer(docker: Docker): Promise<Docker.Container> {
    const entries = fs.readFileSync("/proc/self/cgroup").toString().split(/\r?\n/);
    if (entries.length === 0) throw new Error("Cannot get own container id!");
    const entry = entries[0];
    const [, , path] = entry.split(":");
    const psplit = path.split("/");
    const id = ld.last(psplit);
    if (id === undefined) throw new Error("Cannot get own container id!");
    return docker.getContainer(id);
}

export function secondsSince(start: number): number {
    return (Date.now() - start) / 1000;
}
