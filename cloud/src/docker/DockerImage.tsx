import { Component } from "@adpt/core";
import { ImageInfo } from "./types";

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
     * This property returns undefined if no image has ever been built by
     * this component OR if the component props have changed and the image
     * that corresponds to the current props has not yet been built.
     */
    image: ImageInfo | undefined;

    /**
     * Returns information about the most current version of the Docker image
     * that has completed building, even if that version does not reflect the
     * current set of props for the component.
     * @remarks
     * Returns undefined if no image has ever been built by this component.
     */
    latestImage(): ImageInfo | undefined;

}

export interface DockerImageProps {}

export abstract class DockerImage extends Component<DockerImageProps>
    implements DockerImageInstance {

    image: ImageInfo | undefined;
    latestImage(): ImageInfo | undefined {
        return undefined;
    }
}
