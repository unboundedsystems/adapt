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

import { Handle } from "@adpt/core";
import { ContainerLabels, ContainerProps } from "../Container";
import { Environment } from "../env";
import { DockerImageInstance } from "./DockerImage";

/**
 * Options for interacting with Docker Engine that apply to all
 * operations.
 * @public
 */
export interface DockerGlobalOptions {
    dockerHost?: string;
}

/**
 * Options for performing Docker image builds.
 * @public
 */
export interface DockerBuildOptions extends DockerGlobalOptions {
    forceRm?: boolean;
    imageName?: string;
    imageTag?: string;
    prevUniqueTag?: string;
    stdin?: string;
    /**
     * If true and the newly built image ID does not match the image ID for
     * prevUniqueTag (or prevUniqeTag is not set), a new unique nameTag is
     * generated for this image (from imageName and imageTag).
     * If true and the newly built image ID does match the image ID for
     * prevUniqueTag, then prevUniqueTag is returned as nameTag.
     * If false, imageName and imageTag are used without modification.
     */
    uniqueTag?: boolean;
    /**
     * If set, will add a Docker LABEL with the DeployID.
     */
    deployID?: string;
    buildArgs?: Environment;
}

/**
 * A dynamically-created file that can be used during the build of a Docker
 * image.
 *
 * @remarks
 * These `File` objects are used to create a temporary "scratch" image in a
 * {@link https://docs.docker.com/develop/develop-images/multistage-build/ | multi-stage build}
 * that contains only the specified files. Then, in later stages of that build,
 * the files within the temporary image can be copied into the later stage
 * image.
 * @public
 */
export interface File {
    /**
     * The path in the temporary image where the file will be created.
     */
    path: string;
    /**
     * The contents of the file.
     */
    contents: Buffer | string;
}

/**
 * A stage to be added to a
 * {@link https://docs.docker.com/develop/develop-images/multistage-build/ | multi-stage Docker build}.
 *
 * @remarks
 * The stage will be added to the generated Dockerfile for the image as:
 * ```
 * FROM image as name
 * ```
 * @public
 */
export interface Stage {
    /** The image (name + tag or digest) to use for the stage. */
    image: string;
    /** Name for the stage */
    name: string;
}

/**
 * A string that contains both a Docker repo and a registry digest.
 *
 * @remarks
 * This is a string that represents a specific image on a specific registry
 * contained in a particular repo on that registry. It's of the form:
 * ```
 * [registry/]repo@digest
 * ```
 * `registry` - (optional) The hostname or hostname:port of a Docker registry
 * where the repo is located. If not provided, the official default Docker
 * registry is assumed.
 *
 * `repo` - The more precise name for what's commonly referred to as an image
 * name. It may include 0 or more slashes to denote namespaces.
 *
 * `digest` - The repo digest for the image in the form `algorithm:hex`.
 * This digest is specific to the associated registry and repo and has no
 * significance without those additional pieces of information. If this image is
 * pushed to a different registry, it will have a different digest value.
 * The digest is also known as a "distribution hash".
 *
 * Examples:
 * ```
 * alpine@sha256:04696b491e0cc3c58a75bace8941c14c924b9f313b03ce5029ebbc040ed9dcd9
 * localhost:5000/mockdeploy-htws@sha256:899a03e9816e5283edba63d71ea528cd83576b28a7586cf617ce78af5526f209
 * ```
 * @public
 */
export type RepoDigestString = string;

/**
 * Docker image ID, in the form `algorithm:hex`.
 *
 * @remarks
 * The Docker image ID (also known as "Content Hash") is a single value
 * that uniquely identifies a specific image on a local Docker host.
 *
 * An image ID does not require a registry or repo qualifier to be significant.
 * It is distinct from a Docker image
 * {@link docker.RepoDigestString | repo digest}.
 *
 * Example:
 * ```
 * sha256:199e537da3a86126cd6eb114bd0b13ab178dc291bbb6ea4a4a3aa257b2366b71
 * ```
 * @public
 */
export type ImageIdString = string;

/**
 * A string reference to a Docker image that contains a repo name, and may
 * contain an optional registry and optional tag.
 *
 * @remarks
 * This is a string that references a Docker image. It's in the form of
 * one of:
 * ```
 * [registry/]repo
 * [registry/]repo:tag
 * ```
 * `registry` - (optional) The hostname or hostname:port of a Docker registry
 * where the repo is located. If not provided, depending on context, either
 * the official default Docker registry may be assumed or the image may just
 * be present locally and not on any registry.
 *
 * `repo` - The more precise name for what's commonly referred to as an image
 * name. It may include 0 or more slashes to denote namespaces.
 *
 * `tag` - A tag string identifying a version of image within the repo.
 *
 * Examples:
 * ```
 * alpine
 * ubuntu:16.04
 * ```
 * @public
 */
export type NameTagString = string;

/**
 * A string reference to a Docker image that contains a repo name, and may
 * contain an optional registry and optionally either a tag or a repo digest.
 *
 * @remarks
 * This is a string that references a Docker image. It's in the form of
 * one of:
 * ```
 * [registry/]repo
 * [registry/]repo:tag
 * [registry/]repo@digest
 * ```
 * For more detail, see {@link docker.NameTagString} and
 * {@link docker.RepoDigestString}.
 *
 * Examples:
 * ```
 * alpine
 * ubuntu:16.04
 * alpine@sha256:04696b491e0cc3c58a75bace8941c14c924b9f313b03ce5029ebbc040ed9dcd9
 * localhost:5000/mockdeploy-htws@sha256:899a03e9816e5283edba63d71ea528cd83576b28a7586cf617ce78af5526f209
 * ```
 * @public
 */
export type ImageNameString = NameTagString | RepoDigestString;

/**
 * A string that references a Docker registry that contains a hostname and
 * may optionally contain a port and/or path.
 *
 * @remarks
 * This string is in the form of one of:
 * ```
 * hostname[:port]
 * hostname[:port]/path
 * ```
 * This form does not include the protocol, such as `http:` or `https:` in
 * the string.
 *
 * @public
 */
export type RegistryString = string;

/**
 * Information about a specific instance of a Docker image, as identified by
 * its image ID.
 * @public
 */
export interface ImageInfo {
    /**
     * Docker image ID, in the form `algorithm:hex`.
     * @remarks
     * See {@link docker.ImageIdString}.
     */
    id: ImageIdString;

    /**
     * Docker image name and optional tag in the form `name` or `name:tag`.
     * @remarks
     * See {@link docker.NameTagString}
     */
    nameTag?: NameTagString;
}

/**
 * Props for {@link docker.DockerContainer}
 *
 * @public
 */
export interface DockerContainerProps extends DockerGlobalOptions,
    Pick<ContainerProps, "autoRemove" | "environment" | "portBindings" | "command" | "stopSignal"> {
    /** image name as a string, or a handle to a DockerImage component */
    image: ImageNameString | Handle<DockerImageInstance>;

    /**
     * Host and port of the remote docker host to use.
     *
     * @remarks
     * Defaults to the DOCKER_HOST environment variable
     */
    dockerHost: string;
    /**
     * Labels to apply to the container.
     */
    labels?: ContainerLabels;
    /**
     * Networks to connect the container to
     *
     * @remarks
     * Accepts the same strings as docker network connect
     */
    networks?: string[];
}
