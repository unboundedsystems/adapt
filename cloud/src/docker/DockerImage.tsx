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

import { Component } from "@adpt/core";
import { MaybePromise } from "@adpt/utils";
import { ImageRef, ImageRefRegistry } from "./image-ref";
import { NameTagString } from "./types";

// tslint:disable: member-ordering
/**
 * Components that provide a Docker image can implement this interface to
 * allow other components to get information about the Docker image.
 * @public
 */
export interface DockerImageInstance {
    /**
     * Returns information about the version of the Docker image that reflects
     * the current set of props for the component.
     * @remarks
     * Returns undefined if no image has ever been built by
     * this component OR if the component props have changed and the image
     * that corresponds to the current props has not yet been built.
     */
    image(): ImageRef | undefined;

    /**
     * Returns information about the most current version of the Docker image
     * that has completed building, even if that version does not reflect the
     * current set of props for the component.
     * @remarks
     * Returns undefined if no image has ever been built by this component.
     */
    latestImage(): ImageRef | undefined;

    /**
     * Pushes the image returned by `latestImage` to a Docker registry.
     *
     * @param ref - A docker domain, path components, and tag to which this image should be pushed
     *
     * @remarks
     * If there is no latest image available (`latestImage` returns
     * undefined), then `pushTo` will return undefined. Otherwise, if the
     * push was successful, returns an {@link docker.ImageRefRegistry} that contains
     * the complete nameTag, including registry portion.
     */
    pushTo?({ ref }: { ref: NameTagString }): MaybePromise<ImageRefRegistry | undefined>;
}

/**
 * Components that provide a Docker image can implement this interface to
 * allow other components to get information about the Docker image and
 * to be able to push the image to a registry.
 * @public
 */
export interface DockerPushableImageInstance extends DockerImageInstance {
    /**
     * {@inheritdoc docker.DockerImageInstance.pushTo}
     */
    pushTo({ ref }: { ref: NameTagString }): MaybePromise<ImageRefRegistry | undefined>;
}

/**
 * Props for {@link docker.DockerImage}.
 * @beta
 */
export interface DockerImageProps {}

/**
 * Abstract component representing a {@link https://docker.com | Docker}
 * image that can be used to create containers.
 * @remarks
 * See also {@link Container}.
 * @beta
 */
export abstract class DockerImage extends Component<DockerImageProps>
    implements DockerImageInstance {

    /**
     * {@inheritdoc docker.DockerImageInstance.image}
     */
    image(): ImageRef | undefined {
        return undefined;
    }
    /**
     * {@inheritdoc docker.DockerImageInstance.latestImage}
     */
    latestImage(): ImageRef | undefined {
        return undefined;
    }
}
