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

import Adapt, {
    findElementsInDom,
    handle,
    PrimitiveComponent,
    rule,
    Sequence,
    Style,
    useImperativeMethods,
    useMethod,
} from "@adpt/core";
import should from "should";
import { LocalContainer } from "../../src";
import { DockerImage, DockerImageInstance, LocalDockerImage, LocalDockerImageProps } from "../../src/docker";
import { imageRef } from "../../src/docker/image-ref";
import { doBuild } from "../testlib";

const imageSha1 = "sha256:6858809bf669cc5da7cb6af83d0fae838284d12e1be0182f92f6bd96559873e3";
const imageSha2 = "sha256:cc0abc535e36a7ede71978ba2bbd8159b8a5420b91f2fbc520cdf5f673640a34";

class MockDockerImage extends PrimitiveComponent<LocalDockerImageProps>
    implements DockerImageInstance {

    image() {
        return imageRef({
            dockerHost: "default",
            id: imageSha1,
            path: "repo",
            tag: "imagetag",
        });
    }
    latestImage() {
        return imageRef({
            dockerHost: "default",
            id: imageSha2,
            path: "repo",
            tag: "latesttag",
        });
    }
}

function MockService() {
    const img = handle<DockerImageInstance>();
    const latest = useMethod(img, "latestImage");
    const image = useMethod(img, "image");

    useImperativeMethods(() => ({ image, latest }));

    return (
        <Sequence>
            <DockerImage handle={img} />
            {latest && latest.nameTag ?
                <LocalContainer name="myservice" image={latest.nameTag} dockerHost="" /> : null
            }
        </Sequence>
    );
}

const mockImageStyle =
    <Style>
        {DockerImage} {rule(() => <MockDockerImage />)}
        {LocalDockerImage} {rule(() => <MockDockerImage />)}
    </Style>;

const findLocalContainers =
    <Style>
        {LocalContainer} {rule()}
    </Style>;

describe("DockerImage", () => {
    it("Should replace with non-abstract image", async () => {
        const h = handle();
        const orig = <MockService handle={h} />;

        const { dom } = await doBuild(orig, { style: mockImageStyle });
        const els = findElementsInDom(findLocalContainers, dom);
        should(els).have.length(1);
        should(els[0].props.image).equal("repo:latesttag");
        const inst = h.mountedOrig && h.mountedOrig.instance;
        if (!inst) throw should(inst).be.ok();
        should(inst.image).containEql({
            id: imageSha1,
            nameTag: "repo:imagetag",
        });
        should(inst.latest).containEql({
            id: imageSha2,
            nameTag: "repo:latesttag",
        });
    });
});
