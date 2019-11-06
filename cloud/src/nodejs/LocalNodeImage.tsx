/*
 * Copyright 2019 Unbounded Systems, LLC
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
import fs from "fs-extra";
import { isArray, isString } from "lodash";
import path from "path";
import { DockerBuildOptions, LocalDockerImage, LocalDockerImageProps } from "../docker";
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
        const pkgInfo = await fs.readJson(path.join(srcDir, "package.json"));
        const main = pkgInfo.main ? pkgInfo.main : "index.js";
        const runNpmScripts = opts.runNpmScripts;
        const scripts =
            isArray(runNpmScripts) ? runNpmScripts :
                isString(runNpmScripts) ? [runNpmScripts] :
                    [];
        const runCommands =
            scripts.map((s) => `RUN ${opts.packageManager} run ${s}`).join("\n");
        return {
            dockerfile: `
                    FROM node:10-stretch-slim
                    ${argLines(opts.buildArgs)}
                    WORKDIR /app
                    ADD . /app
                    RUN ${opts.packageManager} install
                    ${runCommands}
                    CMD ["node", "${main}"]
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
     * Package manager to use in build steps in the generated Dockerfile
     * that builds {@link nodejs.LocalNodeImage}.
     */
    packageManager?: "npm" | "yarn" | string;
    /**
     * Scripts that are defined in your
     * {@link https://docs.npmjs.com/files/package.json | package.json file}
     * that should be run during the image build.
     */
    runNpmScripts?: string | string[];
    /**
     * Environment variables that should be present during docker build
     *
     * @remarks
     * This adds an `ARG <varName>` line to the Dockerfile for every variable in env, and sets the
     * variable in the environment before running `docker build`.
     */
    buildArgs?: Environment;
}

const defaultContainerBuildOptions = {
    imageName: "node-service",
    packageManager: "npm",
    uniqueTag: true,
    buildArgs: {}
};
