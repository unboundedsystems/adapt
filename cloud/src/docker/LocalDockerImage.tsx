/*
 * Copyright 2019-2020 Unbounded Systems, LLC
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
import { ImageRefDockerHost, ImageRefRegistry, isImageRefRegistryWithId, mutableImageRef, WithId } from "./image-ref";
import {
    DockerBuildOptions,
    File,
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
     * ```tsx
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
    image?: WithId<ImageRefDockerHost>;
    imagePropsJson?: string;
    prevUniqueNameTag?: string;
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
            dockerHost: process.env.DOCKER_HOST,
            forceRm: true,
        },
    };

    // Even though we have a custom deployedWhen, don't normally show
    // status from this component, unless there's an active action.
    deployedWhenIsTrivial = true;

    private image_?: WithId<ImageRefDockerHost>;
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

    async pushTo(registryUrl: string, newPathTag?: string): Promise<undefined | WithId<ImageRefRegistry>> {
        const source = this.latestImage();
        if (!source) return undefined;

        newPathTag = newPathTag || source.pathTag;
        if (!newPathTag) {
            throw new Error(`Unable to push image to registry: path and tag not ` +
                `set for this image and new path and tag not provided`);
        }
        const dest = mutableImageRef({
            id: source.id,
        });
        dest.pathTag = newPathTag;
        dest.domain = registryUrl;
        const destRef = dest.registryTag;
        if (!destRef) {
            throw new InternalError(`Unable to push image to registry: ` +
                `destination reference '${dest.ref}' has no registryTag`);
        }

        const globals = pickGlobals(this.options_);
        await dockerTag({ existing: source.id, newTag: destRef, ...globals});
        await dockerPush({ nameTag: destRef, ...globals });

        const final = dest.freeze();
        if (!isImageRefRegistryWithId(final)) {
            throw new InternalError(`Final pushed image '${final.ref}' is not ` +
                `a complete registry image with ID`);
        }
        return final;
    }

    latestImage() {
        return this.image_ || this.state.image;
    }

    /**
     * User-facing name to display in status messages.
     */
    displayName() { return this.options_.imageName; }

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
        const prevUniqueNameTag = this.state.prevUniqueNameTag;

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
            if (img && img.nameTag) stages.push({ image: img.nameTag, name: "files" });

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
                prevUniqueNameTag,
                stdin: dockerfile,
            });
        });

        this.image_ = image;
        this.setState({
            deployOpID: this.deployInfo.deployOpID,
            image,
            imagePropsJson: this.imagePropsJson,
            prevUniqueNameTag: options.uniqueTag ? image.nameTag : undefined,
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
