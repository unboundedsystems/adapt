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

import should from "should";
import { ImageRefData, MutableImageRef, mutableImageRef } from "../../src/docker/image-ref";

interface ExpectedRef {
    _digest?: string | undefined;
    _domain?: string | undefined;
    _id?: string | undefined;
    _path?: string | undefined;
    _tag?: string | undefined;
}

function checkRef(actual: MutableImageRef, expected: ExpectedRef) {
    should(actual._digest).equal(expected._digest);
    should(actual._domain).equal(expected._domain);
    should(actual._id).equal(expected._id);
    should(actual._path).equal(expected._path);
    should(actual._tag).equal(expected._tag);
    // Check clone
    should(mutableImageRef(actual)).eql(actual);

    // Check toJSON
    const expJson: ImageRefData = {};
    if (expected._digest) expJson.digest = expected._digest;
    if (expected._domain) expJson.domain = expected._domain;
    if (expected._id) expJson.id = expected._id;
    if (expected._path) expJson.path = expected._path;
    if (expected._tag) expJson.tag = expected._tag;

    should(actual.toJSON()).eql(expJson);
}

const idSha = "sha256:04696b491e0cc3c58a75bace8941c14c924b9f313b03ce5029ebbc040ed9dcd9";
const digestSha = "sha256:899a03e9816e5283edba63d71ea528cd83576b28a7586cf617ce78af5526f209";

describe("ImageRef", () => {
    it("Should construct from object", () => {
        const ref1 = new MutableImageRef({
            domain: "reg.io:1234",
            id: idSha,
            path: "myrepo/image",
            tag: "mytag",
        });
        checkRef(ref1, {
            _domain: "reg.io:1234",
            _id: idSha,
            _path: "myrepo/image",
            _tag: "mytag",
        });
        should(ref1.freeze()).eql({
            domain: "reg.io:1234",
            familiar: "reg.io:1234/myrepo/image:mytag",
            id: idSha,
            name: "reg.io:1234/myrepo/image",
            nameTag: "reg.io:1234/myrepo/image:mytag",
            path: "myrepo/image",
            pathTag: "myrepo/image:mytag",
            ref: "reg.io:1234/myrepo/image:mytag",
            registry: "reg.io:1234",
            registryRef: "reg.io:1234/myrepo/image:mytag",
            registryTag: "reg.io:1234/myrepo/image:mytag",
            tag: "mytag",
            type: "registry",
        });
    });

    it("Should construct from object with digest", () => {
        const ref1 = new MutableImageRef({
            digest: digestSha,
            domain: "reg.io:1234",
            id: idSha,
            path: "myrepo/image",
            tag: "mytag",
        });
        checkRef(ref1, {
            _digest: digestSha,
            _domain: "reg.io:1234",
            _id: idSha,
            _path: "myrepo/image",
            _tag: "mytag",
        });
        should(ref1.freeze()).eql({
            digest: digestSha,
            domain: "reg.io:1234",
            familiar: `reg.io:1234/myrepo/image@${digestSha}`,
            id: idSha,
            name: "reg.io:1234/myrepo/image",
            nameTag: "reg.io:1234/myrepo/image:mytag",
            path: "myrepo/image",
            pathTag: "myrepo/image:mytag",
            ref: `reg.io:1234/myrepo/image@${digestSha}`,
            registry: "reg.io:1234",
            registryRef: `reg.io:1234/myrepo/image@${digestSha}`,
            registryDigest: `reg.io:1234/myrepo/image@${digestSha}`,
            registryTag: "reg.io:1234/myrepo/image:mytag",
            tag: "mytag",
            type: "registry",
        });
    });

    it("Should construct from string", () => {
        const ref1 = new MutableImageRef("ubuntu");
        checkRef(ref1, {
            _path: "ubuntu",
        });
        should(ref1.freeze()).eql({
            name: "ubuntu",
            path: "ubuntu",
            ref: "ubuntu",
            type: "incomplete",
        });
    });

    it("Should construct from string and normalize", () => {
        const ref1 = new MutableImageRef("ubuntu", true);
        checkRef(ref1, {
            _domain: "docker.io",
            _path: "library/ubuntu",
            _tag: "latest",
        });
        should(ref1.freeze()).eql({
            domain: "docker.io",
            familiar: "ubuntu",
            name: "docker.io/library/ubuntu",
            nameTag: "docker.io/library/ubuntu:latest",
            path: "library/ubuntu",
            pathTag: "library/ubuntu:latest",
            ref: "docker.io/library/ubuntu:latest",
            registry: "docker.io",
            registryRef: "docker.io/library/ubuntu:latest",
            registryTag: "docker.io/library/ubuntu:latest",
            tag: "latest",
            type: "registry",
        });
    });

    it("Should set registryTag", () => {
        const ref1 = new MutableImageRef();
        checkRef(ref1, {});

        ref1.registryTag = `a.reg.co.au/some-repo:foo-tag`;
        checkRef(ref1, {
            _domain: "a.reg.co.au",
            _path: "some-repo",
            _tag: "foo-tag",
        });
        should(ref1.freeze()).eql({
            domain: "a.reg.co.au",
            familiar: "a.reg.co.au/some-repo:foo-tag",
            name: "a.reg.co.au/some-repo",
            nameTag: "a.reg.co.au/some-repo:foo-tag",
            path: "some-repo",
            pathTag: "some-repo:foo-tag",
            ref: "a.reg.co.au/some-repo:foo-tag",
            registry: "a.reg.co.au",
            registryRef: "a.reg.co.au/some-repo:foo-tag",
            registryTag: "a.reg.co.au/some-repo:foo-tag",
            tag: "foo-tag",
            type: "registry",
        });
    });

    it("Should set registryDigest", () => {
        const ref1 = new MutableImageRef();
        checkRef(ref1, {});

        ref1.registryDigest = `reg.io/some/sub/repo@${digestSha}`;
        checkRef(ref1, {
            _digest: digestSha,
            _domain: "reg.io",
            _path: "some/sub/repo",
        });
        should(ref1.freeze()).eql({
            digest: digestSha,
            domain: "reg.io",
            familiar: `reg.io/some/sub/repo@${digestSha}`,
            name: "reg.io/some/sub/repo",
            path: "some/sub/repo",
            ref: `reg.io/some/sub/repo@${digestSha}`,
            registry: "reg.io",
            registryRef: `reg.io/some/sub/repo@${digestSha}`,
            registryDigest: `reg.io/some/sub/repo@${digestSha}`,
            type: "registry",
        });
    });

    it("Should round trip", () => {
        const mutable1 = mutableImageRef({
            digest: digestSha,
            domain: "reg.io:1234",
            id: idSha,
            path: "myrepo/image",
            tag: "mytag",
        });
        const frozen1 = mutable1.freeze();
        const mutable2 = mutableImageRef(frozen1);
        const frozen2 = mutable2.freeze();
        should(mutable1).eql(mutable2);
        should(frozen1).eql(frozen2);
    });

    it("Should use default tag with nameTag setter", () => {
        const ref1 = new MutableImageRef();

        // Note: "some" will be the domain here.
        ref1.nameTag = "some/repo/image";
        should(ref1.freeze()).eql({
            domain: "some",
            familiar: `some/repo/image`,
            name: "some/repo/image",
            nameTag: "some/repo/image:latest",
            path: "repo/image",
            pathTag: "repo/image:latest",
            ref: `some/repo/image:latest`,
            registry: "some",
            registryRef: `some/repo/image:latest`,
            registryTag: `some/repo/image:latest`,
            tag: "latest",
            type: "registry",
        });
    });

    it("Should not use default tag with setNameTag and useDefaultTag=false", () => {
        const ref1 = new MutableImageRef();

        // Note: "some" will be the domain here.
        ref1.setNameTag("some/repo/image", false);
        should(ref1.freeze()).eql({
            domain: "some",
            name: "some/repo/image",
            path: "repo/image",
            ref: `some/repo/image`,
            registry: "some",
            type: "incomplete",
        });
    });

    it("Should use default tag with pathTag setter", () => {
        const ref1 = new MutableImageRef({
            domain: "reg",
        });

        ref1.pathTag = "some/repo/image";
        should(ref1.freeze()).eql({
            domain: "reg",
            familiar: `reg/some/repo/image`,
            name: "reg/some/repo/image",
            nameTag: "reg/some/repo/image:latest",
            path: "some/repo/image",
            pathTag: "some/repo/image:latest",
            ref: `reg/some/repo/image:latest`,
            registry: "reg",
            registryRef: `reg/some/repo/image:latest`,
            registryTag: `reg/some/repo/image:latest`,
            tag: "latest",
            type: "registry",
        });
    });

    it("Should not use default tag with setPathTag and useDefaultTag=false", () => {
        const ref1 = new MutableImageRef({
            domain: "reg",
        });

        ref1.setPathTag("some/repo/image", false);
        should(ref1.freeze()).eql({
            domain: "reg",
            name: "reg/some/repo/image",
            path: "some/repo/image",
            ref: `reg/some/repo/image`,
            registry: "reg",
            type: "incomplete",
        });
    });
});
