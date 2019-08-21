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

import {
    ChangeType,
    DeployOpID,
    DeployStatus,
    GoalStatus,
    waiting,
} from "@adpt/core";
import { InternalError } from "@adpt/utils";
import fs from "fs-extra";
import stringify from "json-stable-stringify";
import * as path from "path";
import { Action, ActionContext, ShouldAct } from "../action";
import {
    dockerBuild,
    dockerPush,
    dockerTag,
    pickGlobals,
    withFilesImage,
} from "./cli";
import { DockerPushableImageInstance } from "./DockerImage";
import {
    DockerBuildOptions,
    File,
    ImageInfo,
    NameTagString,
    Stage,
} from "./types";

/**
 * Props for {@link docker.LocalDockerImage}
 *
 * @public
 */
export interface LocalDockerImageProps {
    /** Directory for use as the build context in docker build */
    contextDir?: string;
    /**
     * Contents of the dockerfile
     *
     * @remarks
     * Should not be used if dockerfileName is set
     */
    dockerfile?: string;
    /**
     * Path to a local Dockerfile in the Adapt project.
     *
     * @remarks
     * This path is relative to the root of the Adapt project.
     * Should not be used if `dockerfile` is set.
     */
    dockerfileName?: string;
    /**
     * Extra files that should be included during the docker build
     *
     * @remarks
     * LocalDockerImage uses a multi-stage build process.  It first creates
     * a temporary image that includes the files specified in this field.
     * This temporary image is then made available to the `dockerfile` with
     * stage name `files` and can then be copied into the final image, as
     * desired, using `COPY` or `ADD` commands in the `dockerfile`.
     *
     * @example
     * To create a final Docker image that contains a file that has some
     * programmatically created content, use the `dockerfile` prop along
     * with the `files` prop like this:
     * ```
     * const files = [{
     *   path: '/path/to/myfile.txt',
     *   contents: 'contents for myfile\n'
     * }];
     * const dockerfile = `
     *   FROM alpine
     *   COPY --from=files /path/to/myfile.txt /app/myfile.txt
     *   ...
     * `;
     * return <LocalDockerImage files={files} dockerfile={dockerfile} />
     * ```
     */
    files?: File[];
    /**
     * Options to control the behavior of docker build
     */
    options?: DockerBuildOptions;
    /**
     * Extra stages to include in a multi-stage docker build
     */
    stages?: Stage[];
}

/**
 * @internal
 */
export interface LocalDockerImageState {
    deployOpID?: DeployOpID;
    image?: ImageInfo;
    imagePropsJson?: string;
    prevUniqueTag?: string;
}

/**
 * Locally builds a docker image
 *
 * @remarks
 * See {@link docker.LocalDockerImageProps}.
 *
 * @public
 */
export class LocalDockerImage
    extends Action<LocalDockerImageProps, LocalDockerImageState>
    implements DockerPushableImageInstance {

    static defaultProps = {
        options: {
            forceRm: true,
        },
    };

    private image_?: ImageInfo;
    private imagePropsJson_?: string;
    private options_: DockerBuildOptions;

    constructor(props: LocalDockerImageProps) {
        super(props);
        this.options_ = { ...LocalDockerImage.defaultProps.options, ...(props.options || {}) };

        if (!props.dockerfile && !props.dockerfileName) {
            throw new Error(`LocalDockerImage: one of dockerfile or ` +
                `dockerfileName must be given`);
        }
    }

    /*
     * Public instance properties/methods
     */
    buildComplete() { return this.image() != null; }
    ready() { return this.buildComplete(); }

    image() {
        if (this.image_ == null) {
            if (this.state.image != null &&
                // Ensure we've rebuilt at least once this OpID
                this.state.deployOpID === this.deployInfo.deployOpID &&
                // And ensure the current build matches current props
                this.state.imagePropsJson === this.imagePropsJson) {

                this.image_ = this.state.image;
            }
        }
        return this.image_;
    }

    async pushTo(registryUrl: string, newTag?: NameTagString): Promise<undefined | ImageInfo> {
        const im = this.latestImage();
        if (!im) return undefined;
        newTag = newTag || im.nameTag;
        if (!newTag) {
            throw new Error(`Unable to push image to registry: no nameTag ` +
                `set for this image and new tag not provided`);
        }
        const fullTag = `${registryUrl}/${newTag}`;
        const globals = pickGlobals(this.options_);
        await dockerTag({ existing: im.id, newTag: fullTag, ...globals});
        await dockerPush({ nameTag: fullTag, ...globals });
        return {
            id: im.id,
            nameTag: fullTag,
        };
    }

    latestImage() {
        return this.image_ || this.state.image;
    }

    /**
     * Implementations for Action base class
     * @internal
     */
    async shouldAct(op: ChangeType): Promise<ShouldAct> {
        let imgName = this.options_.imageName || "";
        if (imgName) imgName = ` '${imgName}'`;

        if (op === ChangeType.delete) return false;

        if (this.buildComplete()) return false;
        return {
            act: true,
            detail: `Building Docker image${imgName}`,
        };
    }

    /**
     * Implementations for Action base class
     * @internal
     */
    async action(op: ChangeType, ctx: ActionContext) {
        const options = {
            ...this.options_,
            deployID: ctx.buildData.deployID,
        };
        const prevUniqueTag = this.state.prevUniqueTag;

        if (op === ChangeType.delete) {
            throw new InternalError(`Delete action should not happen due to check in shouldAct`);
        }

        let dockerfile = this.props.dockerfile;
        if (!dockerfile) {
            if (!this.props.dockerfileName) {
                throw new InternalError(`dockerfileName should not be null`);
            }
            dockerfile = (await fs.readFile(this.props.dockerfileName)).toString();
        }

        const stages = this.props.stages || [];

        const image = await withFilesImage(this.props.files, options, async (img) => {
            if (img) stages.push({ image: img.id, name: "files" });

            const stageConfig = stages
                .map((s) => `FROM ${s.image} as ${s.name}`)
                .join("\n");
            if (stageConfig) {
                dockerfile = `${stageConfig}\n\n${dockerfile}`;
            }

            let contextDir = this.props.contextDir || ".";
            contextDir = path.resolve(contextDir);
            return dockerBuild("-", contextDir, {
                ...options,
                prevUniqueTag,
                stdin: dockerfile,
            });
        });

        this.image_ = image;
        this.setState({
            deployOpID: this.deployInfo.deployOpID,
            image,
            imagePropsJson: this.imagePropsJson,
            prevUniqueTag: options.uniqueTag ? image.nameTag : undefined,
        });
    }

    /*
     * Component methods
     */

    /** @internal */
    initialState() { return {}; }

    /** @internal */
    deployedWhen = (goalStatus: GoalStatus) => {
        if (goalStatus === DeployStatus.Destroyed) return true;
        if (this.buildComplete()) return true;

        if (this.state.imagePropsJson &&
            this.state.imagePropsJson !== this.imagePropsJson) {
            return waiting("Waiting for Docker image to be re-built");
        }
        return waiting("Waiting for Docker image to be built");
    }

    /** @internal */
    protected get imagePropsJson() {
        if (!this.imagePropsJson_) {
            const { handle: _h, key, ...imageProps } = this.props;
            this.imagePropsJson_ = stringify(imageProps);
        }
        return this.imagePropsJson_;
    }
}
