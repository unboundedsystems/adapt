/*
 * Copyright 2020 Unbounded Systems, LLC
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

import { Environment } from "../env";
import { RegistryString } from "./types";

/**
 * Options for interacting with BuildKit that apply to all
 * operations.
 * @public
 */
export interface BuildKitGlobalOptions {
    /**
     * The BUILDKIT_HOST string used to communicate with a BuildKit
     * daemon.
     *
     * @example
     * `tcp://example.com:5678`
     *
     * @example
     * `docker-container://container-name`
     */
    buildKitHost?: string;
}

/**
 * Uses a Docker daemon as storage for container images.
 * @public
 */
export interface ImageStorageDocker {
    type: "docker";
    /**
     * The DOCKER_HOST string for the host where images are stored.
     */
    dockerHost?: string;
}

/**
 * Uses a container registry as storage for container images.
 * @public
 */
export interface ImageStorageRegistry {
    type: "registry";
    /**
     * Push using HTTP instead of HTTPS.
     */
    insecure?: boolean;
    /**
     * The container registry location.
     */
    registry: RegistryString;
}

/**
 * Describes storage for container images.
 * @public
 */
export type ImageStorage = ImageStorageDocker | ImageStorageRegistry;

export interface ImageNameTagOptions {
    /**
     * The repo name portion of the image tag to add to the image.
     * @example
     * `ubuntu`
     */
    imageName: string;
    /**
     * The tag portion of the image tag to add to the image.
     * @example
     * `10.2.1`
     */
    imageTag?: string;
    /**
     * Use with `uniqueTag` to avoid generating a new unique tag if the newly
     * built image is identical to `prevUniqueTag`.
     */
    prevUniqueTag?: string;
    /**
     * If true and the newly built image ID does not match the image ID for
     * prevUniqueTag (or prevUniqeTag is not set), a new unique nameTag is
     * generated for this image (from imageName and imageTag).
     * If true and the newly built image ID does match the image ID for
     * prevUniqueTag, then prevUniqueTag is returned as nameTag.
     * If false, imageName and imageTag are used without modification.
     */
    uniqueTag?: boolean;
}

/**
 * Output option for {@link docker.BuildKitBuildOptions} that pushes the image
 * built by {@link docker.BuildKitImage} to a Docker daemon instance.
 * @public
 */
export interface BuildKitOutputDocker extends ImageStorageDocker, ImageNameTagOptions {
}

/**
 * Output option for {@link docker.BuildKitBuildOptions} that pushes the image
 * built by {@link docker.BuildKitImage} to a container image registry.
 * @public
 */
export interface BuildKitOutputRegistry extends ImageStorageRegistry, ImageNameTagOptions {
}

export function isBuildKitOutputRegistry(val: BuildKitOutput): val is BuildKitOutputRegistry {
    return val.type === "registry";
}

export type BuildKitOutput = BuildKitOutputDocker | BuildKitOutputRegistry;

/**
 * Options for performing image builds with BuildKit.
 * @public
 */
export interface BuildKitBuildOptions extends BuildKitGlobalOptions {
    buildArgs?: Environment;
    /**
     * If set, will add a LABEL to the image with the Adapt DeployID.
     */
    deployID?: string;
    /**
     * Frontend to use to process the build.
     * @defaultValue `dockerfile.v0`
     */
    frontend?: string;
}
