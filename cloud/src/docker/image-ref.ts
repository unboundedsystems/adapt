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

import { tuple } from "@adpt/utils";
import { WithRequiredT } from "type-ops";
import {
    defaultDomain,
    defaultOfficialRepo,
    defaultTag,
    parseFamiliar,
    parseName,
    parsePathTag,
    parseReference,
    validate,
} from "./image-ref-parse";
import { ImageIdString, ImageNameString, NameTagString, RegistryString, RepoDigestString } from "./types";

/**
 * The most basic components that make up a {@link docker.ImageRef}.
 * All other properties of a {@link docker.ImageRef} can be computed from
 * these.
 * @remarks
 * See also {@link docker.ImageRef} for more information on references.
 * @public
 */
export interface ImageRefData {
    /**
     * Image digest in the form `algorithm:hex`
     * @example
     * sha256:04696b491e0cc3c58a75bace8941c14c924b9f313b03ce5029ebbc040ed9dcd9
     */
    digest?: string;
    /**
     * Docker host string to contact the Docker daemon where this image is
     * located.
     *
     * @remarks
     * This should be in the same format that Docker expects for the `DOCKER_HOST`
     * environment variable. The special string `default` can also be used,
     * which will use the current value of the `DOCKER_HOST` environment variable,
     * if it is set and will otherwise use the default named pipe on Windows
     * (`npipe:///./pipe/docker_engine`) and the default socket on other
     * systems (`unix:///var/run/docker.sock`).
     * @example
     * tcp://localhost:2375
     */
    dockerHost?: "default" | string;
    /**
     * Hostname and optional port number of the container image registry where
     * this image is located.
     * @example
     * docker.io
     * @example
     * localhost:5000
     */
    domain?: RegistryString;
    /**
     * Image content ID in the form `algorithm:hex`
     * @example
     * sha256:199e537da3a86126cd6eb114bd0b13ab178dc291bbb6ea4a4a3aa257b2366b71
     */
    id?: ImageIdString;
    /**
     * The image repo path.
     * @example
     * google/cloud-sdk
     */
    path?: string;
    /**
     * Image tag
     * @example
     * latest
     */
    tag?: string;
}

const imageRefDataKeys = tuple(
    "digest",
    "dockerHost",
    "domain",
    "id",
    "path",
    "tag",
);

/**
 * The type of an image reference indicates how the image can be
 * accessed, currently either through a Docker host (daemon) or directly to a
 * container registry via its API.
 *
 * @remarks
 * If not enough information is present to access and uniquely identify a
 * container image, the type is `incomplete`.
 * @public
 */
export type ImageRefType = "incomplete" | "registry" | "dockerhost";

/**
 * An immutable reference to a container image, including all information
 * known about the image.
 *
 * @remarks
 * This type is the base type for an image reference and is allowed to
 * contain partial or incomplete information about a container image.
 * It can include both information about how to access the image and
 * also information about the image itself.
 *
 * Many of the properties of {@link docker.ImageRef} are related to the
 * container image reference string used by Docker and other container-based
 * systems. A container image reference string is a structured string
 * containing multiple components. The most basic components are illustrated
 * below, using the example image reference string
 * `"my.registry:5000/a/repo/path:sometag@sha256:899a03e9816e5283edba63d"`.
 *
 * NOTE: The length of the `digest` has been shortened for formatting
 * purposes.
 *
 * ```
 * "my.registry:5000/a/repo/path:sometag@sha256:899a03e9816e5283edba63d"
 * |     domain     |   path    |  tag  |         digest               |
 * ```
 *
 * To aid in correct formatting, {@link docker.ImageRef} and related types and
 * classes also provide helper properties that combine these basic components
 * into combinations that are often useful, such as `name`, which is the
 * `domain` and `path` combined with a `/`.
 *
 * Many tools, such as the Docker UI, also accept a shortened form of a string
 * reference, called the `familiar` form. An example of a familiar reference is
 * `ubuntu`. In this form, only the `path` component is required. When
 * components of the reference are left out, default values are assumed. The
 * default `domain` is `docker.io` and the default `tag` is `latest`.
 * Additionally, if the `domain` is `docker.io` and there are no `/` characters
 * in the `path`, `library/` is prepended to the path. So `ubuntu` is the
 * familiar form for the complete reference `docker.io/library/ubuntu:latest`.
 *
 * An {@link docker.ImageRef} is designed to hold as much information about
 * an image as may be available and therefore some properties that are
 * not known will be `undefined`.
 *
 * See also {@link docker.MutableImageRef}, which can be used to parse
 * reference strings and construct or modify image references.
 * @public
 */
export interface ImageRef extends Readonly<ImageRefData> {
    /**
     * The complete string reference for this image in familiar form, which
     * leaves out certain fields from the reference when they are set to
     * default values.
     * @remarks
     * This reference form is the form typically used in the Docker UI.
     * If the ImageRef is not complete, familiar will return `undefined`, as
     * the correct familiar representation cannot be determined.
     * @example
     * mysql
     * @example
     * gcr.io/my-project/image:1.0.1
     */
    readonly familiar?: string;
    /**
     * The image name, which is comprised of the optional domain and
     * the (non-optional) path. Will be `undefined` if there is no `path`.
     * @example
     * gcr.io/my-project/image
     */
    readonly name?: string;
    /**
     * The image name (including any registry) and image tag. Returns undefined
     * if either path or tag are not set.
     * If nameTag is set to a string that does not contain a tag (i.e. does
     * not include a ":"), the default tag of `latest` will be set.
     * To set nameTag without defaulting to `latest`, call the class method
     * `setNameTag` with the parameter `useDefaultTag` set to `false`.
     * @example
     * gcr.io/my-project/image:1.0.1
     */
    readonly nameTag?: string;
    /**
     * The image path (not including any registry) and image tag. Returns
     * undefined if either `path` or `tag` are not set.
     * @example
     * my-project/image:1.0.1
     */
    readonly pathTag?: string;
    /**
     * The best (most specific and complete) string reference for this image,
     * given the information available in this {@link docker.ImageRef}.
     */
    readonly ref: string;
    /**
     * An alias for `domain`.
     */
    readonly registry?: string;
    /**
     * The best remote reference available for this image in either
     * `domain/path@digest` format or `domain/path:tag` format.
     * @remarks
     * Returns `registryDigest` if it is set, otherwise returns `registryTag`.
     * If no remote reference is available, returns undefined.
     * @example
     * gcr.io/my-project/image\@sha256:899a03e9816e5283edba63d71ea528cd83576b28a7586cf617ce78af5526f209
     * @example
     * gcr.io/my-project/image:1.0.1
     */
    readonly registryRef?: string;
    /**
     * The remote digest reference in `domain/path@digest` form.
     * @remarks
     * Undefined if any of `domain`, `path`, or `digest` are unset.
     * @example
     * gcr.io/my-project/image\@sha256:899a03e9816e5283edba63d71ea528cd83576b28a7586cf617ce78af5526f209
     */
    readonly registryDigest?: string;
    /**
     * The remote tag reference in `domain/path:tag` form.
     * @remarks
     * Undefined if any of `domain`, `path`, or `tag` are unset.
     * @example
     * gcr.io/my-project/image:1.0.1
     */
    readonly registryTag?: string;
    /**
     * The type of an image reference indicates how the image can be
     * accessed, either through a Docker host (daemon) or directly to a
     * container registry.
     *
     * @remarks
     * A reference is a valid `dockerhost` type ref when it contains a valid
     * dockerHost string and either:
     * - A valid image id or
     * - A valid path and either a valid tag or digest.
     *
     * A reference is a valid `registry` type ref when it contains a valid
     * domain, path, and either a tag or a digest.
     *
     * If not enough information is present to access and uniquely identify a
     * container image, the type is `incomplete`.
     */
    readonly type: ImageRefType;
}

const imageRefKeys = tuple(
    "digest",
    "dockerHost",
    "domain",
    "familiar",
    "id",
    "name",
    "nameTag",
    "path",
    "pathTag",
    "ref",
    "registry",
    "registryRef",
    "registryDigest",
    "registryTag",
    "tag",
    "type",
);

/**
 * Helper type that augments a base type to indicate that the `id` field
 * is present and has a valid image ID.
 * @public
 */
export type WithId<T> = T & { id: ImageIdString };

/**
 * Type guard for determining whether a given object has a non-null `id`
 * property.
 * @public
 */
export function hasId<T extends { id?: ImageIdString }>(o: T): o is WithId<T> {
    return hasProperty(o, "id");
}

/**
 * A mutable reference to a container image that can be used to parse,
 * construct, and modify an image reference, as well as to hold information
 * about the image and how to access it.
 *
 * @remarks
 * This class can be used to parse strings that contain complete or partial
 * container image references. It can also be used to construct an image
 * reference from scratch, from individual component parts, or from another
 * reference, then to correctly format the reference or its components for
 * use with various tools.
 *
 * To parse and normalize a "familiar" image reference, like is typically
 * seen in the Docker UI:
 * ```ts
 * const ref = mutableImageRef("redis", true);
 * console.log(ref.tag);         // => "latest"
 * console.log(ref.registryRef); // => "docker.io/library/redis:latest"
 * ```
 *
 * To construct a reference to an image present on the local Docker daemon
 * that has an image ID:
 * ```ts
 * const ref = mutableImageRef({
 *     dockerHost: "default",
 *     path: "myimage",
 *     tag: "just-built",
 *     id: "sha256:04696b491e0cc3c58a75bace8941c14c924b9f313b03ce5029ebbc040ed9dcd9",
 * });
 * ```
 *
 * To convert a `MutableImageRef` to an immutable plain object `ImageRef`,
 * use the `freeze` method.
 * @public
 */
export class MutableImageRef implements ImageRef {
    _digest?: string;
    _dockerHost?: string;
    _domain?: string;
    _id?: ImageIdString;
    _path?: string;
    _tag?: string;

    constructor(ref: ImageNameString, normalize?: boolean);
    constructor(info?: ImageRefData | undefined);
    constructor(info?: ImageRefData | ImageNameString | undefined, normalize = false) {
        if (!info) return;
        if (typeof info === "string") {
            const ref = normalize ? parseFamiliar(info) : parseReference(info);
            this.name = ref.name;
            if (ref.tag) this._tag = ref.tag;
            if (ref.digest) this._digest = ref.digest;
            return;
        }
        if (info.dockerHost && info.domain) {
            throw new Error(`Cannot specify both 'dockerHost' and 'domain' when creating an image reference`);
        }
        if (info.digest) this.digest = info.digest;
        if (info.dockerHost) this.dockerHost = info.dockerHost;
        if (info.domain) this.domain = info.domain;
        if (info.id) this.id = info.id;
        if (info.path) this.path = info.path;
        if (info.tag) this.tag = info.tag;
    }

    freeze(): ImageRef {
        const ret: any = {};
        for (const k of imageRefKeys) {
            if (this[k] !== undefined) ret[k] = this[k];
        }
        return Object.freeze(ret);
    }

    toData(): ImageRefData {
        const ret: ImageRefData = {};
        for (const k of imageRefDataKeys) {
            if (this[k] !== undefined) ret[k] = this[k];
        }
        return ret;
    }

    toJSON() {
        return this.toData();
    }

    /**
     * The digest string for this image in its associated registry and repo
     * in the form `algorithm:hex`.
     */
    get digest(): string | undefined {
        return this._digest;
    }
    set digest(digest: string | undefined) {
        if (digest == null) delete this._digest;
        else this._digest = validate("digest", digest);
    }

    get dockerHost(): string | undefined {
        return this._dockerHost;
    }
    set dockerHost(dockerHost: string | undefined) {
        if (!dockerHost) delete this._dockerHost;
        else this._dockerHost = dockerHost;
    }

    /**
     * The hostname and optional port of the image registry for this image.
     */
    get domain(): string | undefined {
        return this._domain;
    }
    set domain(domain: string | undefined) {
        if (domain == null) delete this._domain;
        else this._domain = validate("domain", domain);
    }

    /**
     * The complete string reference for this image in familiar form, which
     * leaves out certain fields from the reference when they are set to
     * default values.
     * @remarks
     * This reference form is the form typically used in the Docker UI.
     * If the ImageRef is not complete, familiar will return `undefined`, as
     * the correct familiar representation cannot be determined.
     */
    get familiar(): string | undefined {
        if (this.registryDigest) return this.registryDigest;
        if (this.type === "incomplete") return undefined;

        let path = this._path!;
        if (!path) return undefined;

        const domain = !this._domain || this._domain === defaultDomain ? "" : `${this._domain}/`;
        if (this._domain === defaultDomain && path.startsWith(`${defaultOfficialRepo}/`)) {
            path = path.slice(`${defaultOfficialRepo}/`.length);
        }
        const tag = !this._tag || this._tag === defaultTag ? "" : `:${this._tag}`;
        const digest = this._digest && !tag ? `@${this._digest}` : "";
        return domain + path + tag + digest;
    }

    /**
     * The content ID of the image in `algorithm:hex` format.
     */
    get id(): ImageIdString | undefined {
        return this._id;
    }
    set id(id: ImageIdString | undefined) {
        if (id == null) delete this._id;
        else this._id = validate("id", id);
    }

    /**
     * The image name, which is comprised of the optional domain and
     * the (non-optional) path.
     */
    get name(): string | undefined {
        if (!this._path) return undefined;
        return this._domain ? `${this._domain}/${this._path}` : this._path;
    }
    set name(name: string | undefined) {
        if (name == null) {
            delete this._domain;
            delete this._path;
        } else {
            const parsed = parseName(name);
            if (parsed.domain) this._domain = parsed.domain;
            this._path = parsed.path;
        }
    }

    /**
     * The image name (including any registry) and image tag. Returns undefined
     * if either path or tag are not set.
     * If nameTag is set to a string that does not contain a tag (i.e. does
     * not include a ":"), the default tag of `latest` will be set.
     * To set nameTag without defaulting to `latest`, call the class method
     * `setNameTag` with the parameter `useDefaultTag` set to `false`.
     */
    get nameTag(): NameTagString | undefined {
        if (!this.name || !this.tag) return undefined;
        return `${this.name}:${this.tag}`;
    }
    set nameTag(nt: NameTagString | undefined) {
        this.setNameTag(nt);
    }

    /**
     * Method to set the image name and image tag which also allows choice
     * of default behavior when `nameTag` does not contain a tag string.
     */
    setNameTag(nameTag: NameTagString | undefined, useDefaultTag = true) {
        if (nameTag == null) {
            this.name = undefined;
            this.tag = undefined;
        } else {
            const ref = parseReference(nameTag);
            if (ref.digest) {
                throw new Error(`Invalid container image nameTag '${nameTag}'`);
            }
            this.name = ref.name;
            let tag = ref.tag;
            if (!tag && useDefaultTag) tag = defaultTag;
            this._tag = tag;
        }
    }

    /**
     * The image repo path.
     */
    get path(): string | undefined {
        return this._path;
    }
    set path(path: string | undefined) {
        if (path == null) delete this._path;
        else this._path = validate("path", path);
    }

    /**
     * The image path (not including any registry) and image tag. Returns
     * undefined if either path or tag are not set.
     * If pathTag is set to a string that does not contain a tag (i.e. does
     * not include a ":"), the default tag of `latest` will be set.
     * To set pathTag without defaulting to `latest`, call the class method
     * `setPathTag` with the parameter `useDefaultTag` set to `false`.
     */
    get pathTag(): string | undefined {
        if (!this.path || !this.tag) return undefined;
        return `${this.path}:${this.tag}`;
    }
    set pathTag(pathTag: string | undefined) {
        this.setPathTag(pathTag);
    }

    /**
     * Method to set the image path and image tag which also allows choice
     * of default behavior when `pathTag` does not contain a tag string.
     */
    setPathTag(pathTag: string | undefined, useDefaultTag = true) {
        if (pathTag == null) {
            this.path = undefined;
            this.tag = undefined;
        } else {
            const pt = parsePathTag(pathTag);
            this.path = pt.path;
            let tag = pt.tag;
            if (!tag && useDefaultTag) tag = defaultTag;
            this._tag = tag;
        }
    }

    get ref(): string {
        return this.registryRef || this.nameTag || this.name || this.path || this.id || "INVALIDREF";
    }

    /**
     * Alias for domain
     */
    get registry(): string | undefined {
        return this.domain;
    }

    /**
     * The best remote reference available for this image in either
     * `domain/path@digest` format or `domain/path:tag` format.
     * @remarks
     * Returns `registryDigest` if it is set, otherwise returns `registryTag`.
     * If no remote reference is available, returns undefined.
     */
    get registryRef(): ImageNameString | undefined {
        return this.registryDigest || this.registryTag;
    }

    /**
     * The remote digest reference in `domain/path@digest` form.
     * @remarks
     * Undefined if any of `domain`, `path`, or `digest` are unset.
     */
    get registryDigest(): RepoDigestString | undefined {
        if (!this._domain || !this._path || !this._digest) return undefined;
        return `${this.name}@${this._digest}`;
    }
    set registryDigest(rd: RepoDigestString | undefined) {
        if (rd == null) {
            this.name = undefined; // use setter
            delete this._digest;
        } else {
            const ref = parseReference(rd);
            if (ref.tag) {
                throw new Error(`Invalid container image registryDigest '${rd}': must not contain tag`);
            }
            this.name = ref.name;
            this._digest = ref.digest;
        }

    }

    /**
     * The remote tag reference in `domain/path:tag` form.
     * @remarks
     * Undefined if any of `domain`, `path`, or `tag` are unset.
     */
    get registryTag(): NameTagString | undefined {
        if (!this.domain) return undefined;
        return this.nameTag;
    }
    set registryTag(rt: NameTagString | undefined) {
        if (rt == null) {
            this.name = undefined;
            this.tag = undefined;
        } else {
            const ref = parseReference(rt);
            if (ref.digest) {
                throw new Error(`Invalid container image registryTag '${rt}': must not contain digest`);
            }
            this.name = ref.name;
            this.tag = ref.tag;
        }

    }

    /**
     * The image tag.
     */
    get tag(): string | undefined {
        return this._tag;
    }
    set tag(tag: string | undefined) {
        if (tag == null) delete this._tag;
        else this._tag = validate("tag", tag);
    }

    /**
     * The type of an image reference indicates how the image can be
     * accessed, either through a Docker host (daemon) or directly to a
     * container registry.
     *
     * @remarks
     * A reference is a valid `dockerhost` type ref when it contains a valid
     * dockerHost string and either:
     * - A valid image id or
     * - A valid path and either a valid tag or digest.
     *
     * A reference is a valid `registry` type ref when it contains a valid
     * domain, path, and either a tag or a digest.
     *
     * If not enough information is present to access and uniquely identify a
     * container image, the type is `incomplete`.
     */
    get type(): ImageRefType {
        if (this._dockerHost) {
            return this._id || (this._path && (this._tag || this._digest)) ? "dockerhost" : "incomplete";
        }
        return this._domain && this._path && (this._tag || this._digest) ? "registry" : "incomplete";
    }
}

/**
 * Factory function for creating a {@link docker.MutableImageRef}.
 * @remarks
 * Can also be used to clone an existing {@link docker.MutableImageRef} or
 * to create a mutable version of an existing {@link docker.ImageRef}.
 * @public
 */
export function mutableImageRef(ref: ImageNameString, normalize?: boolean): MutableImageRef;
/**
 * Factory function for creating a {@link docker.MutableImageRef}.
 * @remarks
 * Can also be used to clone an existing {@link docker.MutableImageRef} or
 * to create a mutable version of an existing {@link docker.ImageRef}.
 * @public
 */
export function mutableImageRef(info?: ImageRefData): MutableImageRef;
export function mutableImageRef(info?: ImageRefData | ImageNameString, normalize = false): MutableImageRef {
    return new MutableImageRef(info as any, normalize);
}

/**
 * Factory function for creating a {@link docker.ImageRef} or cloning an
 * existing one.
 * @public
 */
export function imageRef(ref: ImageNameString, normalize?: boolean): ImageRef;
/**
 * Factory function for creating a {@link docker.ImageRef} or cloning an
 * existing one.
 * @public
 */
export function imageRef(info?: ImageRefData): ImageRef;
export function imageRef(info?: ImageRefData | ImageNameString, normalize = false): ImageRef {
    const mutable = new MutableImageRef(info as any, normalize);
    return mutable.freeze();
}

/**
 * A more specific type of {@link docker.ImageRef} that contains sufficient
 * information to uniquely identify an image on a container registry.
 * @public
 */
export interface ImageRefRegistry {
    readonly digest?: string;
    readonly domain: string;
    readonly familiar: string;
    readonly id?: ImageIdString;
    readonly name: string;
    readonly nameTag?: string;
    readonly path: string;
    readonly pathTag?: string;
    readonly ref: string;
    readonly registry: string;
    readonly registryRef: string;
    readonly registryDigest?: string;
    readonly registryTag?: string;
    readonly tag?: string;
    readonly type: "registry";
}

/**
 * A type guard for determining whether a {@link docker.ImageRef} is a
 * {@link docker.ImageRefRegistry}.
 * @public
 */
export function isImageRefRegistry(ref: ImageRef): ref is ImageRefRegistry {
    return ref.type === "registry";
}

/**
 * A type guard for determining whether a {@link docker.ImageRef} is a
 * {@link docker.ImageRefRegistry} that has the `id` property set.
 * @public
 */
export function isImageRefRegistryWithId(ref: ImageRef): ref is WithId<ImageRefRegistry> {
    return ref.type === "registry" && typeof ref.id === "string";
}

/**
 * A more specific type of {@link docker.ImageRef} that contains sufficient
 * information to uniquely identify an image on a specific Docker host
 * (daemon).
 * @public
 */
export interface ImageRefDockerHost {
    readonly digest?: string;
    readonly dockerHost: string;
    readonly domain?: string;
    readonly familiar: string;
    readonly id?: ImageIdString;
    readonly name: string;
    readonly nameTag?: string;
    readonly path: string;
    readonly pathTag?: string;
    readonly ref: string;
    readonly registry?: string;
    readonly registryRef?: string;
    readonly registryDigest?: string;
    readonly registryTag?: string;
    readonly tag?: string;
    readonly type: "dockerhost";
}

/**
 * A type guard for determining whether a {@link docker.ImageRef} is a
 * {@link docker.ImageRefDockerHost}.
 * @public
 */
export function isImageRefDockerhost(ref: ImageRef): ref is ImageRefDockerHost {
    return ref.type === "dockerhost";
}

/**
 * A type guard for determining whether a {@link docker.ImageRef} is a
 * {@link docker.ImageRefDockerHost} that has the `id` property set.
 * @public
 */
export function isImageRefDockerhostWithId(ref: ImageRef): ref is WithId<ImageRefDockerHost> {
    return ref.type === "dockerhost" && typeof ref.id === "string";
}

/**
 * A type guard for asserting whether an object has a property that is not
 * undefined.
 * @public
 */
function hasProperty<T extends object, K extends keyof T>(o: T, k: K): o is T & WithRequiredT<T, K> {
    return o[k] !== undefined;
}
