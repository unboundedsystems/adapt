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

import Docker = require("dockerode");
import execa from "execa";
import * as fs from "fs";
import ld from "lodash";
import os from "os";
import * as sb from "stream-buffers";
import * as util from "util";

export async function dockerExec(container: Docker.Container, command: string[]): Promise<string> {
    const exec = await container.exec({
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: true,
        Cmd: command
    });

    const output = await exec.start();
    const buf = new sb.WritableStreamBuffer();
    const errBuf = new sb.WritableStreamBuffer();
    exec.modem.demuxStream(output, buf, errBuf);
    return new Promise<string>((res, rej) => {
        output.on("end", async () => {
            const inspectInfo = await exec.inspect();
            if (inspectInfo.Running !== false) {
                rej(new Error(`dockerExec: ${util.inspect(command)} stream ended with process still running?!`));
                return;
            }
            if (inspectInfo.ExitCode !== 0) {
                // tslint:disable-next-line:max-line-length
                let msg = `dockerExec: ${util.inspect(command)} process ` +
                    `exited with error (code: ${inspectInfo.ExitCode})`;
                const stderr = errBuf.getContentsAsString();
                if (stderr) msg += "\n" + stderr;
                rej(new Error(msg));
                return;
            }
            res(buf.getContentsAsString() || "");
        });
    });
}

export async function dockerPull(docker: Docker, imageName: string, indent = ""): Promise<void> {
    // tslint:disable:no-console
    function printStatus(data: unknown) {
        if (!(data instanceof Buffer)) throw new Error(`Unknown status: ${data}`);
        // data is JSONL, so can contain multiple messages
        const msgs = data.toString().split("\n").filter((m) => m.trim() !== "");
        for (const mString of msgs) {
            const msg = JSON.parse(mString);
            let s = msg.status;
            if (!s) {
                console.log(`${indent}Docker pull status:`, msg);
                continue;
            }
            if (msg.id) s += ` id=${msg.id}`;
            const prog = msg.progressDetail;
            if (prog && prog.current != null) s += ` Progress: ${prog.current}/${prog.total}`;
            console.log(`${indent}  ${s}`);
        }
    }

    if (!imageName.includes(":")) {
        throw new Error(`dockerPull: imageName must include tag or be an ID`);
    }

    console.log(`${indent}Pulling docker image ${imageName}`);

    return new Promise<void>((res, rej) => {
        let errored = false;

        function mkErr(e: any) {
            if (errored) return;
            errored = true;
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
                if (errored) return;
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
    try {
        await network.disconnect({ Container: container.id });
    } catch (e) {
        // Ignore error if not connected to this network
        if (!(typeof e.message === "string" &&
            e.message.includes("is not connected to network"))) {
            throw e;
        }
    }
}

export async function getSelfContainer(docker: Docker): Promise<Docker.Container | null> {
    if (os.platform() === "win32") return null;

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

export interface DockerUtilOpts {
    dockerHost?: string;
}

function dockerArgs(opts: DockerUtilOpts, ...moreArgs: string[]) {
    const args = [];
    if (opts.dockerHost) args.push("-H", opts.dockerHost);
    return args.concat(moreArgs);
}

/**
 * Delete all Docker containers that match a filter string.
 * @example
 * Example for deleting containers created for an Adapt deployment:
 * ```
 * import { adaptDockerDeployIDKey } from "@adpt/cloud/docker";
 * const filter = `label=${adaptDockerDeployIDKey}=${lDeployID}`;
 * await deleteAllContainers(filter);
 * ```
 */
export async function deleteAllContainers(filter: string, opts: DockerUtilOpts = {}) {
    try {
        let args = dockerArgs(opts, "ps", "-a", "-q", "--filter", filter);
        const { stdout: ctrList } = await execa("docker", args);
        if (!ctrList) return;
        const ctrs = ctrList.split(/\s+/);

        args = dockerArgs(opts, "rm", "-f", ...ctrs);
        if (ctrs.length > 0) await execa("docker", args);
    } catch (err) {
        if (/invalid argument/.test(err.stderr || "")) throw err;
        // tslint:disable-next-line: no-console
        console.log(`Error deleting containers (ignored):`, err);
    }
}

/**
 * Delete all Docker networks that match a filter string.
 * @example
 * Example for deleting networks created for an Adapt deployment:
 * ```
 * import { adaptDockerDeployIDKey } from "@adpt/cloud/docker";
 * const filter = `label=${adaptDockerDeployIDKey}=${lDeployID}`;
 * await deleteAllNetworks(filter);
 * ```
 */
export async function deleteAllNetworks(filter: string, opts: DockerUtilOpts = {}) {
    try {
        let args = dockerArgs(opts, "network", "ls", "-q", "--filter", filter);
        const { stdout: netList } = await execa("docker", args);
        if (!netList) return;
        const nets = netList.split(/\s+/);

        args = dockerArgs(opts, "network", "rm", ...nets);
        if (nets.length > 0) await execa("docker", args);
    } catch (err) {
        if (/invalid argument/.test(err.stderr || "")) throw err;
        // tslint:disable-next-line: no-console
        console.log(`Error deleting networks (ignored):`, err);
    }
}

/**
 * Delete all Docker images or image tags that match a filter string.
 * @remarks
 * Note that this may only delete image tags and may not completely remove
 * the actual layers stored if other tags reference the same layers.
 * @example
 * Example for deleting images created for an Adapt deployment:
 * ```
 * import { adaptDockerDeployIDKey } from "@adpt/cloud/docker";
 * const filter = `label=${adaptDockerDeployIDKey}=${lDeployID}`;
 * await deleteAllImages(filter);
 * ```
 */
export async function deleteAllImages(filter: string, opts: DockerUtilOpts = {}) {
    try {
        let args = dockerArgs(opts, "image", "ls", "-q", "--filter", filter);
        const { stdout: imgList } = await execa("docker", args);
        if (!imgList) return;
        const imgs = ld.uniq(imgList.split(/\s+/m));

        args = dockerArgs(opts, "rmi", "-f", ...imgs);
        if (imgs.length > 0) await execa("docker", args);
    } catch (err) {
        if (/invalid argument/.test(err.stderr || "")) throw err;
        // tslint:disable-next-line: no-console
        console.log(`Error deleting images (ignored):`, err);
    }
}
