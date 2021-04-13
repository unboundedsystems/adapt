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

import { callFirstInstanceWithMethod, callInstanceMethod, ChangeType, DependsOnMethod, Handle, isHandle } from "@adpt/core";
import { MaybePromise } from "@adpt/utils";
import { isEqual } from "lodash";
import { URL } from "url";
import { Action } from "../action";
import { DockerImageInstance, DockerPushableImageInstance } from "./DockerImage";
import { imageRef, ImageRef, ImageRefRegistry } from "./image-ref";
import { DockerSplitRegistryInfo, NameTagString, RegistryString } from "./types";

/**
 * Props for {@link docker.RegistryDockerImage}
 * @public
 */
export interface RegistryDockerImageProps {
    /**
     * Handle for image source
     * @remarks
     * Currently, only handle to LocalDockerImage components and compatible
     * interfaces are supported.
     * @privateRemarks
     * FIXME(manishv) support string refs to other registries and handles of
     * other registry images
     */
    imageSrc: Handle<DockerPushableImageInstance>;
    /**
     * Registry and path where the image should be pushed and pulled
     *
     * @remarks
     * If this parameter is a string, registryPrefix will be used for both push and pull
     *
     * If registryPrefix is of the form `{ external: string, internal: string }`, docker images wil be
     * pushed to `external` and image strings will refer to `internal`.
     *
     * Registry prefixes can be of the form `domain/path/elements`, for example `gcr.io/myproject`.
     * However, the registryPrefix should not include the final name, use newPathTag instead.
     *
     * Note(manishv)
     * This is a bit of a hack to allow one hostname or IP address to push images from outside
     * a particular environment (say k8s) and a different URL for that environment to pull
     * images.
     *
     * A good example of this is a k3s-dind (k3s docker-in-docker) instance of kubernetes where
     * a private registry is running on a docker network attached to the k3s-dind instance, but where we
     * want to push {@link docker.LocalDockerImage} built images to that registry.  Since
     * {@link docker.LocalDockerImage | LocalDockerImage} is outside the k3s-dind environment, it must
     * use a host accessible network to push to the registry.  However, since the k3s-dind instance sees
     * the registry from within Docker, it must use a different address to pull the images for use.
     *
     * Once network scopes are fully supported, this interface will change to whatever is appropriate.  It
     * is best if you can arrange to have the same URL or registry string work for all access regardless
     * of which network the registry, Adapt host, and ultimate container running environment is uses.
     */
    registryPrefix: RegistryString | DockerSplitRegistryInfo;

    /**
     * Path and tag to be used for the image in the new registry in
     * `path:tag` or `path` format.
     * @remarks
     * The entire path and tag are blindly concatenated to the domain and path
     * in registryPrefix to form the full ref that will be used to push the
     * image.
     *
     * If omitted, the last component of the path and the tag from the source
     * image is used. The newPathTag should not include the registry
     * hostname/port prefix. If the `:tag` portion of `path:tag` is omitted,
     * the tag `latest` will be used.
     */
    newPathTag?: string;

    /**
     * Path and tag to be used for the image in the new registry in
     * `path:tag` or `path` format.
     * @deprecated This prop has been renamed to `newPathTag`. The functionality
     * for both props is the same and if both are set, `newPathTag` takes
     * priority.
     * @remarks
     * If omitted, the path and tag from the source image is used. The
     * newTag should not include the registry hostname/port prefix. If the
     * `:tag` portion of `path:tag` is omitted, the tag `latest` will be used.
     */
    newTag?: string;
}

interface State {
    image?: ImageRefRegistry;
    registryPrefix?: DockerSplitRegistryInfo;
}

function buildNameTag(url: string, pathTag: string | undefined): NameTagString | undefined {
    const ir = imageRef([url.replace(/\/$/, ""), pathTag].join("/"), true);
    return ir.nameTag;
}

function urlToRegistryString(registryPrefix: string): RegistryString {
    let ret: string;
    if (registryPrefix.startsWith("http")) {
        const parsed = new URL(registryPrefix);
        ret = parsed.host + parsed.pathname;
    } else {
        ret = registryPrefix;
    }
    if (ret.endsWith("/")) ret = ret.slice(0, -1);
    return ret;
}

function normalizeRegistryUrl(url: string | DockerSplitRegistryInfo) {
    if (typeof url === "string") {
        const urlString = urlToRegistryString(url);
        url = { external: urlString, internal: urlString };
    }
    return {
        external: urlToRegistryString(url.external),
        internal: urlToRegistryString(url.internal)
    };
}

function extractBasePathTag(imageHandle: string | Handle<DockerImageInstance>): string | undefined {
    let pathTag: string | undefined;
    if (typeof imageHandle === "string") {
        pathTag = imageHandle;
    } else {
        const ref = callInstanceMethod<ImageRef | undefined>(
            imageHandle,
            undefined,
            "latestImage"
        );
        if (ref === undefined) return undefined;
        pathTag = ref.tag ? ref.pathTag : ref.path;
    }

    if (pathTag === undefined) return undefined;
    const pathTagSplit = pathTag.split("/");
    return pathTagSplit[pathTagSplit.length - 1];
}

/**
 * Represents a Docker image in a registry.
 * @remarks
 * If the image does not exist in the specified registry, it will be pushed
 * to that registry.
 * @public
 */
export class RegistryDockerImage extends Action<RegistryDockerImageProps, State>
    implements DockerImageInstance {

    private latestImage_?: ImageRefRegistry;
    private latestRegistryUrl_?: DockerSplitRegistryInfo;
    private registry: { external: RegistryString, internal: RegistryString };

    constructor(props: RegistryDockerImageProps) {
        super(props);

        this.registry = normalizeRegistryUrl(props.registryPrefix);
    }

    /**
     * Returns information about the version of the Docker image that reflects
     * the current set of props for the component and has been pushed to the
     * registry.
     * @remarks
     * Returns undefined if the `props.imageSrc` component's `latestImage` method
     * returns undefined (depending on the component referenced by
     * `props.imageSrc`, that may indicate the source image has not been built).
     * Also returns undefined if the current image has not yet been
     * pushed to the registry.
     */
    image() {
        const srcImage = callInstanceMethod<ImageRef | undefined>(this.props.imageSrc, undefined, "latestImage");
        const latestImg = this.latestImage();
        const latestReg = this.latestRegistryUrl_ || this.state.registryPrefix;
        if (!srcImage || !latestImg || !latestReg) return undefined;
        if (srcImage.id === latestImg.id &&
            this.currentNameTag(srcImage.pathTag) === latestImg.nameTag &&
            isEqual(this.registry, latestReg)) {
            return latestImg;
        }
        return undefined; // Pushed image is not current
    }
    /**
     * Returns information about the most current version of the Docker image
     * that has been pushed to the registry.
     * @remarks
     * Returns undefined if no image has ever been pushed by this component.
     */
    latestImage() { return this.latestImage_ || this.state.image; }

    /** @internal */
    initialState() { return {}; }

    /** @internal */
    shouldAct(diff: ChangeType) {
        if (diff === ChangeType.delete) return false;
        let name = this.getNewPathTag() || this.srcImageName();
        name = name ? ` '${name}'` : "";
        return { act: true, detail: `Pushing image${name} to ${this.registry.external}` };
    }

    /** @internal */
    dependsOn: DependsOnMethod = (_goalStatus, helpers) => {
        if (!isHandle(this.props.imageSrc)) return undefined;
        return helpers.dependsOn(this.props.imageSrc);
    }

    /** @internal */
    async action(op: ChangeType): Promise<void> {
        if (op === ChangeType.delete || op === ChangeType.none) return;
        const ref = this.currentNameTag(this.getNewPathTag() ? undefined : extractBasePathTag(this.props.imageSrc));
        const info = await callInstanceMethod<MaybePromise<ImageRefRegistry | undefined>>(
            this.props.imageSrc,
            undefined,
            "pushTo", { ref });
        if (info === undefined) {
            throw new Error(`Image source component did not push image to registry`);
        }

        this.latestImage_ = { ...info };
        this.latestRegistryUrl_ = this.registry;
        this.setState({
            image: this.latestImage_,
            registryPrefix: this.latestRegistryUrl_,
        });
    }

    private currentNameTag(pathTag: string | undefined): NameTagString | undefined {
        if (pathTag === undefined) return buildNameTag(this.registry.internal, this.getNewPathTag());
        return buildNameTag(this.registry.internal, extractBasePathTag(pathTag));
    }

    private getNewPathTag() {
        return this.props.newPathTag || this.props.newTag;
    }

    private srcImageName() {
        return callFirstInstanceWithMethod<string | undefined>(this.props.imageSrc, undefined, "displayName");
    }
}
