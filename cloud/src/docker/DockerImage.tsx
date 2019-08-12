import { Component } from "@adpt/core";
import { MaybePromise } from "@adpt/utils";
import { ImageInfo, NameTagString } from "./types";

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
    image(): ImageInfo | undefined;

    /**
     * Returns information about the most current version of the Docker image
     * that has completed building, even if that version does not reflect the
     * current set of props for the component.
     * @remarks
     * Returns undefined if no image has ever been built by this component.
     */
    latestImage(): ImageInfo | undefined;

    /**
     * Pushes the image returned by `latestImage` to a Docker registry.
     * @remarks
     * If `newTag` is provided, the image will have that tag in the
     * given registry. Otherwise, the image's existing tag will be used.
     * It is an error in that case if there is no tag associated with the
     * `latestImage` image.
     *
     * If there is no latest image available (`latestImage` returns
     * undefined), then `pushTo` will return undefined. Otherwise, if the
     * push was successful, returns an {@link docker.ImageInfo} that contains
     * the complete nameTag, including registry portion.
     */
    pushTo?(registryUrl: string, newTag?: NameTagString): MaybePromise<ImageInfo | undefined>;
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
    pushTo(registryUrl: string, newTag?: NameTagString): MaybePromise<ImageInfo | undefined>;
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
    image(): ImageInfo | undefined {
        return undefined;
    }
    /**
     * {@inheritdoc docker.DockerImageInstance.latestImage}
     */
    latestImage(): ImageInfo | undefined {
        return undefined;
    }
}
