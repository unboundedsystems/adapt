export interface DockerGlobalOptions {
    dockerHost?: string;
}

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
}

export interface File {
    path: string;
    contents: Buffer | string;
}

export interface Stage {
    image: string;
    name: string;
}

/**
 * Information about a specific instance of a Docker image, as identified by
 * its image ID.
 * @public
 */
export interface ImageInfo {
    /**
     * Docker image ID, in the form `algorithm:hex`.
     * @remarks
     * The Docker image ID (also known as "Content Hash") is a single value
     * that uniquely identifies a specific image on a local Docker host.
     *
     * An example image ID is:
     * ```
     * sha256:199e537da3a86126cd6eb114bd0b13ab178dc291bbb6ea4a4a3aa257b2366b71
     * ```
     *
     * An image ID is separate from a Docker image repo digest (also known as
     * "Distribution Hash" or simply "digest").
     */
    id: string;

    /**
     * Docker image name and optional tag in the form `name` or `name:tag`.
     * @remarks
     * The image name is also known as "Repository" or "Repo".
     */
    nameTag?: string;
}
