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

// tslint:disable: max-line-length
// Grammar for an image reference
// (see https://github.com/moby/moby/blob/master/vendor/github.com/docker/distribution/reference/reference.go)
//
// 	reference                       := name [ ":" tag ] [ "@" digest ]
//	name                            := [domain '/'] path-component ['/' path-component]*
//	domain                          := domain-component ['.' domain-component]* [':' port-number]
//	domain-component                := /([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])/
//	port-number                     := /[0-9]+/
//	path-component                  := alpha-numeric [separator alpha-numeric]*
// 	alpha-numeric                   := /[a-z0-9]+/
//	separator                       := /[_.]|__|[-]*/
//
//	tag                             := /[\w][\w.-]{0,127}/
//
//	digest                          := digest-algorithm ":" digest-hex
//	digest-algorithm                := digest-algorithm-component [ digest-algorithm-separator digest-algorithm-component ]*
//	digest-algorithm-separator      := /[+.-_]/
//	digest-algorithm-component      := /[A-Za-z][A-Za-z0-9]*/
//	digest-hex                      := /[0-9a-fA-F]{32,}/ ; At least 128 bit digest value
//
//	identifier                      := /[a-f0-9]{64}/
//	short-identifier                := /[a-f0-9]{6,64}/
// tslint:enable: max-line-length

// Notes:
// - A Familiar reference is one where certain portions of the reference are
//   left out and assumed to be defaults, like is typically used in the Docker
//   UI. For example "ubuntu" is a typial Familiar reference where the
//   domain is assumed to be "docker.io" and tag is assumed to be "latest".
// - Normalizing is the process of applying the defaults to a Familiar
//   reference to create a fully complete registry reference.

const reDigestHex = "[a-fA-F0-9]{32,}";
const reDigestAlgComponent = "[a-zA-Z][a-zA-Z0-9]*";
const reDigestAlgSep = "[+.-_]";
const reDigestAlg = `${reDigestAlgComponent}(?:${reDigestAlgSep}${reDigestAlgComponent})*`;
const reDigest = `${reDigestAlg}:${reDigestHex}`;

const reIdentifierHex = "[a-f0-9]{64}";
const reIdentifier = `${reDigestAlg}:${reIdentifierHex}`;

const reTag = "\\w(?:\\w|[.-]){0,127}";

const reSep = "(?:[_.]|__|[-]*)";
const reAlphaNum = "[a-z0-9]+";
const rePathComp = `${reAlphaNum}(?:${reSep}${reAlphaNum})*`;
const rePath = `${rePathComp}(?:/${rePathComp})*`;
const rePathTagCap = `(${rePath})(?::(${reTag}))?`;
const rePortNum = "[0-9]+";
const reDomainComp = "(?:[a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])";
const reDomain = `${reDomainComp}(?:\\.${reDomainComp})*(?::${rePortNum})?`;
const reName = `(?:${reDomain}/)?${rePath}`;
const reNameCap = `(?:(${reDomain})/)?(${rePathComp}(?:/${rePathComp})*)`;
const reReference = `(${reName})(?::(${reTag}))?(?:@(${reDigest}))?`;

const imageParts = {
    digest: reDigest,
    domain: reDomain,
    id: reIdentifier,
    name: reName,
    path: rePath,
    pathTag: rePathTagCap,
    reference: reReference,
    tag: reTag,
};
export type ImagePart = keyof typeof imageParts;

export function match(part: ImagePart, input: string) {
    const re = RegExp(`^${imageParts[part]}$`);
    return input.match(re);
}

export function validate(part: ImagePart, input: string) {
    if (match(part, input) === null) {
        throw new Error(`Invalid container image ${part} '${input}'`);
    }
    return input;
}

export interface ParsedReference {
    name: string;
    digest?: string;
    tag?: string;
}

export function parseReference(input: string): ParsedReference {
    const m = match("reference", input);
    if (!m) {
        throw new Error(`Invalid container image reference '${input}'`);
    }
    return {
        name: m[1],
        tag: m[2],
        digest: m[3],
    };
}

export interface ParsedName {
    domain?: string;
    path: string;
}

export function parseName(input: string): ParsedName {
    const re = RegExp(`^${reNameCap}$`);
    const m = input.match(re);
    if (!m) {
        throw new Error(`Invalid container image name '${input}'`);
    }
    return {
        domain: m[1],
        path: m[2],
    };
}

export interface ParsedPathTag {
    path: string;
    tag?: string;
}

export function parsePathTag(input: string): ParsedPathTag {
    const re = RegExp(`^${rePathTagCap}$`);
    const m = input.match(re);
    if (!m) {
        throw new Error(`Invalid container image pathTag '${input}'`);
    }
    return {
        path: m[1],
        tag: m[2],
    };
}

export const defaultDomain = "docker.io";
export const defaultOfficialRepo = "library";
export const defaultTag = "latest";

export function parseFamiliar(input: string): ParsedReference {
    const ref = parseReference(input);
    const tag = ref.tag ?? (ref.digest == null ? defaultTag : undefined);

    let domain: string;
    let remainder: string;
    const i = ref.name.indexOf("/");
    if (i === -1 || (!/[.:]/.test(ref.name.slice(0, i)) && ref.name.slice(0, 1) !== "localhost")) {
        domain = defaultDomain;
        remainder = ref.name;
    } else {
        domain = ref.name.slice(0, i);
        remainder = ref.name.slice(i + 1);
    }

    if (domain === defaultDomain && !remainder.includes("/")) {
        remainder = `${defaultOfficialRepo}/${remainder}`;
    }

    return {
        name: `${domain}/${remainder}`,
        tag,
        digest: ref.digest,
    };
}
