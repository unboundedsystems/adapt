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

import { callInstanceMethod, ChangeType, Handle } from "@adpt/core";
import { MaybePromise } from "@adpt/utils";
import { URL } from "url";
import { Action, ActionContext } from "../action";
import { DockerImageInstance, DockerPushableImageInstance } from "./DockerImage";
import { ImageInfo, NameTagString, RegistryString } from "./types";

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
     * URL for the registry where the image is stored (or should be stored).
     */
    registryUrl: string;
    /**
     * Tag to use for the image in the registry.
     * @remarks
     * If omitted, the tag from the source is used.  The tag should not
     * include the registry hostname/port prefix.
     */
    newTag?: string;
}

interface State {
    image: ImageInfo | undefined;
}

function buildNameTag(url: string, nameTag: NameTagString | undefined): NameTagString | undefined {
    if (nameTag === undefined) return undefined;
    return `${url}/${nameTag}`;
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

    private newImage: ImageInfo | undefined = undefined;
    private registry: RegistryString;

    constructor(props: RegistryDockerImageProps) {
        super(props);

        if (props.registryUrl.startsWith("http")) {
            const parsed = new URL(props.registryUrl);
            this.registry = parsed.host + parsed.pathname;
        } else {
            this.registry = props.registryUrl;
        }
        if (this.registry.endsWith("/")) this.registry = this.registry.slice(0, -1);
    }

    image() {
        const srcInfo = callInstanceMethod<ImageInfo | undefined>(this.props.imageSrc, undefined, "image");
        if (srcInfo === undefined) return undefined;
        if (this.state.image === undefined) return undefined;
        if ((srcInfo.id === this.state.image.id) &&
            (this.state.image.nameTag === this.currentNameTag(srcInfo.nameTag))) {
            return this.state.image;
        }
        return this.newImage;
    }
    latestImage() { return this.state.image; }

    /** @internal */
    initialState() { return { image: undefined }; }

    /** @internal */
    shouldAct() {
        return { act: true, detail: `Pushing image to ${this.registry}` };
    }

    /** @internal */
    async action(op: ChangeType, ctx: ActionContext): Promise<void> {
        if (op === ChangeType.delete || op === ChangeType.none) return;
        const info = await callInstanceMethod<MaybePromise<ImageInfo | undefined>>(
            this.props.imageSrc,
            undefined,
            "pushTo", this.registry, this.props.newTag);
        if (info === undefined) {
            ctx.logger.info("No image pushed");
            return;
        }

        this.newImage = { ...info };
        this.setState({ image: this.newImage });
    }

    private currentNameTag(nameTag: NameTagString | undefined): NameTagString | undefined {
        return buildNameTag(this.registry, this.props.newTag || nameTag);
    }
}
