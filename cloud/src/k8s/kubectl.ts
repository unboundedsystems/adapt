/*
 * Copyright 2019-2021 Unbounded Systems, LLC
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

import { debugExec, fetchToCache, withTmpDir } from "@adpt/utils";
import db from "debug";
import execa from "execa";
import { writeFile } from "fs-extra";
import * as ld from "lodash";
import * as os from "os";
import * as path from "path";
import * as readline from "readline";
import { Readable } from "stream";
import { isExecaError } from "../common";
import { Environment, mergeEnvSimple } from "../env";
import { Kubeconfig } from "./common";
import { Manifest } from "./manifest_support";

export const debug = db("adapt:cloud:k8s");
// Enable with DEBUG=adapt:cloud:k8s:out*
export const debugOut = db("adapt:cloud:k8s:out");

const exec = debugExec(debug, debugOut);

function kubectlPlatform(platform: string) {
    switch (platform) {
        case "linux":
        case "darwin":
            return platform;
        case "win32":
            return "windows";
        default:
            throw new Error(`Unsupported platform for kubectl: ${platform}`);
    }
}

const kubeRelease = "v1.19.2";

/**
 * Downloads kubectl and returns path to its location
 *
 * @returns path to kubectl on host
 * @internal
 */
export async function getKubectl(): Promise<string> {
    const platform = kubectlPlatform(os.platform());
    const extension = platform === "windows" ? ".exe" : "";
    const url = `https://storage.googleapis.com/kubernetes-release/release/${kubeRelease}/bin/${platform}/amd64/kubectl${extension}`;
    const { file } = await fetchToCache({
        name: "kubectl",
        url,
        mode: 0o700,
        version: kubeRelease,
    });
    return file;
}

/** @internal */
interface KubectlOptions {
    /** path to kubeconfig */
    kubeconfig?: string;
    env?: Environment;
    printFailure?: boolean;
    reject?: boolean;
}
const kubectlDefaults = {
    printFailure: true,
    reject: true,
};

export async function kubectl(args: string[], options: KubectlOptions) {
    const kubectlPath = await getKubectl();
    const { kubeconfig, env, printFailure, reject } = { ...kubectlDefaults, ...options };
    const actualArgs = [];

    if (kubeconfig) actualArgs.push("--kubeconfig", kubeconfig);

    actualArgs.push(...args);

    return exec(kubectlPath, actualArgs, {
        env: mergeEnvSimple(env),
        printFailure,
        reject,
    });
}

async function getKubeconfigPath(tmpDir: string, config: Kubeconfig | string) {
    if (ld.isString(config)) return config;
    const loc = path.join(tmpDir, "kubeconfig");
    await writeFile(loc, JSON.stringify(config));
    return loc;
}

/** @internal */
export interface KubectlGetOptions {
    /** path to kubeconfig, or kubeconfig as a Javascript object */
    kubeconfig?: Kubeconfig | string;
    /**  Type of k8s object to get (e.g., pod, service) */
    kind: string;
    /** Name of object to get */
    name: string;
}
const getManifestDefaults = {};

/** @internal */
export async function kubectlGet(options: KubectlGetOptions) {
    const opts = { ...getManifestDefaults, ...options };
    const { kubeconfig, kind, name } = opts;
    return withTmpDir(async (tmpDir) => {
        const configPath = kubeconfig && await getKubeconfigPath(tmpDir, kubeconfig);

        const args = ["get", "-o", "json", kind, name];
        let result: execa.ExecaReturnValue<string>;
        try {
            result = await kubectl(args, { kubeconfig: configPath });
        } catch (e) {
            if (isExecaError(e) && e.all) {
                if (e.exitCode !== 0) {
                    if (e.all.match(/Error from server \(NotFound\)/)) return undefined;
                }
            }
            throw e;
        }
        return JSON.parse(result.stdout);
    });
}

/** @internal */
export interface KubectlDiffOptions {
    kubeconfig?: Kubeconfig | string;
    manifest: Manifest;
}

const diffDefaults = {};

const lastApplied = "kubectl.kubernetes.io/last-applied-configuration";

export interface KubectlDiffReturns {
    diff?: string;
    errs: string;
    forbidden: boolean;
    clientFallback: boolean;
}

const diffEnv: Environment = os.platform() === "win32" ? {
    KUBECTL_EXTERNAL_DIFF: path.join(__dirname, "diff.cmd")
} : {};

/** @internal */
export async function kubectlDiff(options: KubectlDiffOptions): Promise<KubectlDiffReturns> {
    const opts = { ...diffDefaults, ...options };
    const { kubeconfig, manifest } = opts;
    return withTmpDir(async (tmpDir) => {
        const configPath = kubeconfig && await getKubeconfigPath(tmpDir, kubeconfig);

        const manifestLoc = path.join(tmpDir, "manifest.json");
        await writeFile(manifestLoc, JSON.stringify(manifest));

        const args = ["diff", "-f", manifestLoc];
        let result: execa.ExecaError | execa.ExecaReturnValue<string> =
            await kubectl(args, {
                env: diffEnv,
                kubeconfig: configPath,
                printFailure: false,
                reject: false,
            });

        const serverInternalErrorRegex = new RegExp("^Error from server \\(InternalError\\)");
        if ((result.exitCode !== 0) && serverInternalErrorRegex.test(result.stderr)) {
            // Some k8s clusters, GKE included, do not support API-server dry-run for all resources,
            // which kubectl diff uses so fallback to using the old style client side diff algorithm that kubectl uses.
            result = await kubectl(["get", "-o", "json", "-f", manifestLoc], {
                kubeconfig: configPath,
                reject: false,
            });
            if (result.exitCode === 0) {
                const srvManifest = JSON.parse(result.stdout);
                if (!srvManifest.annotations || !srvManifest.annotations[lastApplied]) {
                    return {
                        //FIXME(manishv) mimic kubectl diff output here
                        diff: `No ${lastApplied} annotation, assuming diff`,
                        errs: "",
                        forbidden: false,
                        clientFallback: true
                    };
                }
                const srvApplyManifestJSON = srvManifest.annotations[lastApplied];
                const srvApplyManifest = JSON.parse(srvApplyManifestJSON);
                const strippedManifest = JSON.parse(JSON.stringify(manifest));
                if (!ld.isEqual(strippedManifest, srvApplyManifest)) {
                    return {
                        diff: "Unknown diff", //FIXME(manishv) mimic kubectl diff output here
                        errs: "",
                        forbidden: false,
                        clientFallback: true
                    };
                } else {
                    return {
                        errs: result.stderr,
                        forbidden: false,
                        clientFallback: true
                    };
                }
            }
        }

        if (result.exitCode === 0) {
            return {
                errs: result.stderr,
                forbidden: false,
                clientFallback: false
            };
        }

        const forbiddenRegex =
            new RegExp(`^The ${manifest.kind} \"${manifest.metadata.name}\" is invalid: spec: Forbidden`);
        if (forbiddenRegex.test(result.stderr)) {
            return {
                errs: result.stderr,
                forbidden: true,
                clientFallback: false
            };
        }

        if ((result.exitCode === 1)
            && (result.stderr.length === 0)
            && (result.stdout.startsWith("diff "))) {
            return {
                diff: result.stdout,
                errs: "",
                forbidden: false,
                clientFallback: false
            };
        }

        throw result; //Should be ExecaError if result.exitCode was not zero
    });
}

/** @internal */
export interface KubectlOpManifestOptions {
    /** kubeconfig as a Javascript object, or a path to a kubeconfig file */
    kubeconfig?: Kubeconfig | string;
    dryRun?: boolean;
    manifest: Manifest;
    wait?: boolean;
}

const opManifestDefaults = {
    dryRun: false,
    wait: false
};

export async function kubectlOpManifest(op: "create" | "apply" | "delete", options: KubectlOpManifestOptions) {
    const opts = { ...opManifestDefaults, ...options };
    const { kubeconfig, manifest, dryRun } = opts;
    return withTmpDir(async (tmpDir) => {
        const configPath = kubeconfig && await getKubeconfigPath(tmpDir, kubeconfig);

        const manifestLoc = path.join(tmpDir, "manifest.json");
        await writeFile(manifestLoc, JSON.stringify(manifest));

        const args = [op, "-f", manifestLoc];
        if (op !== "delete" && dryRun) args.push("--dry-run");
        if (op === "delete" && dryRun) throw new Error("Cannot dry-run delete");
        if (op !== "create") args.push(`--wait=${opts.wait}`);
        return kubectl(args, { kubeconfig: configPath });
    });
}

/** @internal */
export interface KubectlProxyOptions {
    kubeconfig?: Kubeconfig | string;
}
const proxyDefaults = {};

async function firstLine(stream: Readable): Promise<{ first: string, rest: readline.Interface }> {
    return new Promise((res, rej) => {
        const lines = readline.createInterface({
            input: stream,
            crlfDelay: Infinity
        });

        let done = false;
        lines.prependOnceListener("line", (text) => {
            if (!done) res({ first: text, rest: lines });
            done = true;
        });

        lines.prependOnceListener("error", (e) => {
            if (!done) rej(e);
            done = true;
        });

        lines.prependOnceListener("close", () => {
            if (!done) rej(new Error("Stream closed before first line was complete"));
            done = true;
        });
    });
}

function extractHostPort(line: string): string {
    const match = /^Starting to serve on (.+)$/.exec(line);
    if (match === null) throw new Error("Cannot parse host line");
    if (match[1] === undefined || match[1] === "") throw new Error("No host/port information found");
    return match[1];
}

export interface KubectlProxyInfo {
    url: string;
    child: execa.ExecaChildProcess<string>;
    kill: () => void;
}

/**  @internal */
export async function kubectlProxy(options: KubectlProxyOptions): Promise<KubectlProxyInfo> {
    const opts = { ...proxyDefaults, ...options };

    const kubeconfig = opts.kubeconfig;

    return withTmpDir(async (tmpDir) => {
        const configPath = kubeconfig && await getKubeconfigPath(tmpDir, kubeconfig);
        const kubectlPath = await getKubectl();

        const args = [];
        if (configPath) args.push("--kubeconfig", configPath);
        args.push("proxy", "--port=0");

        const child = execa(kubectlPath, args, { all: true });
        const kill = () => child.kill();

        let hostPort: string;
        try {
            const { first: proxyInfoStr, rest } = await firstLine(child.stdout);
            rest.on("line", () => { return; }); //Eat extra lines, just in case
            hostPort = extractHostPort(proxyInfoStr);
        } catch (e) {
            if (isExecaError(e)) {
                if (e.all) e.message = `${e.shortMessage}\n${e.all}`;
            } else {
                kill();
                e.message = `Failed to extract proxy host from command: ${kubectlPath} ${args.join(" ")} ` + e.message;
            }
            throw e;
        }

        const url = `http://${hostPort}`;
        return {
            url,
            child,
            kill
        };
    });
}
