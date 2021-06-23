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

import Adapt, {
    BuiltinProps,
    handle,
    useMethodFrom,
    useState,
} from "@adpt/core";
import dockerignore from "@balena/dockerignore";
import fs from "fs-extra";
import glob from "glob-promise";
import ld, { isArray, isString } from "lodash";
import path from "path";
import { DockerBuildOptions, LocalDockerImage, LocalDockerImageProps, NameTagString } from "../docker";
import { Environment, mergeEnvPairs } from "../env";

/**
 * Props for {@link nodejs.LocalNodeImage}
 *
 * @public
 */
export interface LocalNodeImageProps extends Partial<BuiltinProps> {
    /** Source directory for the Node.js program */
    srcDir: string;
    /** Build options */
    options?: NodeImageBuildOptions;
}

function argLines(env: Environment) {
    const pairs = mergeEnvPairs(env);
    if (!pairs) return "";
    const lines = pairs.map((v) => `ARG ${v.name}`);
    return lines.join("\n");
}

async function collectPackageManagerFiles(dir: string): Promise<string[]> {
    if (!await fs.pathExists(dir)) return [];

    const pkgJsonPath = path.join(dir, "package.json");
    if (!await fs.pathExists(pkgJsonPath)) return [];

    const ret = ["package.json"];
    if (await fs.pathExists(path.join(dir, "yarn.lock"))) ret.push("yarn.lock");
    if (await fs.pathExists(path.join(dir, "package-lock.json"))) ret.push("package-lock.json");
    if (await fs.pathExists(path.join(dir, "npm-shrinkwrap.json"))) ret.push("npm-shrinkwrap.json");

    const pkgInfo = await fs.readJson(pkgJsonPath);
    const workspacesGlobs = pkgInfo?.workspaces ?? [];
    if (!Array.isArray(workspacesGlobs)) return ret;
    const workspaces = ld.uniq(ld.flatten(await Promise.all(workspacesGlobs
        .map((w) => isString(w) ? glob(w, { cwd: dir }) : []))));

    const workspaceFileCollections =
        await Promise.all(workspaces.sort().map(async (w) =>
            // Note that the join below explicitly uses "/"" since the OS path sep may not be valid in Dockerfile
            (await collectPackageManagerFiles(path.join(dir, w))).map((f) => [w, f].join("/"))));
    const workspaceFiles = ld.flatten(workspaceFileCollections);
    ret.push(...workspaceFiles);

    return ret;
}

async function filterDockerIgnore(ignoreFile: string, paths: string[]) {
    const ig = dockerignore().add(ignoreFile.split("\n"));
    return ig.filter(paths);
}

/**
 * Locally builds a docker image for a {@link https://www.nodejs.org | Node.js} program.
 *
 * @remarks
 * Implements {@link docker.DockerImageInstance}.
 *
 * See {@link nodejs.LocalNodeImageProps}.
 *
 * @public
 */
export function LocalNodeImage(props: LocalNodeImageProps) {
    const opts = { ...defaultContainerBuildOptions, ...(props.options || {}) };
    const [imgProps, setImgProps] = useState<LocalDockerImageProps | undefined>(undefined);
    const img = handle();

    setImgProps(async () => {
        const srcDir = path.resolve(props.srcDir);
        if (!(await fs.pathExists(srcDir))) throw new Error(`Source directory ${srcDir} not found`);
        const dockerignorePath = path.join(srcDir, ".dockerignore");
        const dockerignoreFile = (await fs.pathExists(dockerignorePath))
            ? (await fs.readFile(dockerignorePath)).toString()
            : "";
        const pkgInfo = await fs.readJson(path.join(srcDir, "package.json"));
        const pkgMgrFiles = await filterDockerIgnore(dockerignoreFile, await collectPackageManagerFiles(srcDir));
        const main = pkgInfo.main ? pkgInfo.main : "index.js";
        const runNpmScripts = opts.runNpmScripts;
        const scripts =
            isArray(runNpmScripts) ? runNpmScripts :
                isString(runNpmScripts) ? [runNpmScripts] :
                    [];
        const runCommands =
            scripts.map((s) => `RUN ${opts.packageManager} run ${s}`).join("\n");
        const { baseImage, nodeVersion, cmd } = opts;
        const cmdString = isArray(cmd)
            ? `[${cmd.map((c) => `"${c}"`).join(",")}]`
            : (cmd ?? `["node", "${main}"]`);

        // Note that we collect files needed for npm or yarn install of node_modules and copy them
        // first, then we install node_modules, and then copy the source code.  This should result in a
        // much smaller set of top-layers that are likely to change, resulting in faster incremental
        // builds, pushes, and updates.  The large node_modules install layer only need be rebuilt and
        // repushed when package.json or yarn.lock/package-lock.json files change, not on every source code
        // change and rebuild.
        return {
            dockerfile: `
                    FROM ${baseImage ?? `node:${nodeVersion}-stretch-slim`}
                    ENV TINI_VERSION v0.18.0
                    ADD https://github.com/krallin/tini/releases/download/\${TINI_VERSION}/tini /tini
                    ENTRYPOINT ["/tini", "--"]
                    WORKDIR /app
                    COPY [${pkgMgrFiles.map((f) => `"${f}"`).join(", ")}, "/app"]
                    ${argLines(opts.buildArgs)}
                    RUN ${opts.packageManager} install && chmod +x /tini
                    CMD ${cmdString}
                    ADD . /app
                    ${runCommands}
                `,
            contextDir: srcDir,
            options: opts,
        };
    });

    useMethodFrom(img, "image");
    useMethodFrom(img, "latestImage");
    useMethodFrom(img, "pushTo");

    return imgProps ? <LocalDockerImage handle={img} {...imgProps} /> : null;
}

/**
 * Options controlling how the Docker image is built in
 * {@link nodejs.LocalNodeImage}.
 * @public
 */
export interface NodeImageBuildOptions extends DockerBuildOptions {
    /**
     * Base Docker image used to build {@link nodejs.LocalNodeImage}.
     *
     * @defaultValue "node:14-stretch-slim"
     */
    baseImage?: NameTagString;
    /**
     * Environment variables that should be present during docker build
     *
     * @remarks
     * This adds an `ARG <varName>` line to the Dockerfile for every variable in env, and sets the
     * variable in the environment before running `docker build`.
     */
    buildArgs?: Environment;
    /**
     * Default command to run in container
     *
     * @remarks
     *
     * If this is a string, the Dockerfile used to build the image will use
     * shell form for the command, i.e., `CMD <cmd value>`.  If this
     * is an array of string, exec form will be used instead, i.e.,
     * `CMD ["cmd[0]", "cmd[1]", "cmd[2]", ...]`.
     *
     * If `cmd` is not specified, the default command of `node` with
     * the value of `main` from the top-level package.json will be used.
     */
    cmd?: string | string[];
    /**
     * Node version used to build {@link nodejs.LocalNodeImage}.
     *
     * @defaultValue 14
     *
     * @remarks
     * If baseImage is specified, this option is ignored and baseImage
     * is used instead.  Otherwise, `node:${nodeVersion}-stretch-slim` is
     * used as the baseImage.
     */
    nodeVersion?: number | string;
    /**
     * Package manager to use in build steps in the generated Dockerfile
     * that builds {@link nodejs.LocalNodeImage}.
     *
     * @defaultValue "npm"
     */
    packageManager?: "npm" | "yarn" | string;
    /**
     * Scripts that are defined in your
     * {@link https://docs.npmjs.com/files/package.json | package.json file}
     * that should be run during the image build.
     */
    runNpmScripts?: string | string[];
}

const defaultContainerBuildOptions = {
    imageName: "node-service",
    nodeVersion: 14,
    packageManager: "npm",
    uniqueTag: true,
    buildArgs: {}
};
