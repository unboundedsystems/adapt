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
    AnyProps,
    callInstanceMethod,
    concatStyles,
    findElementsInDom,
    handle,
    PrimitiveComponent,
    rule,
    Style,
} from "@adpt/core";
import { mochaTmpdir } from "@adpt/testutils";
import execa from "execa";
import fs from "fs-extra";
import path from "path";
import should from "should";
import { Container, NetworkService, Service } from "../../src";
import { createActionPlugin } from "../../src/action/action_plugin";
import { hasId, ImageRef, LocalDockerImage } from "../../src/docker";
import { HttpServer, HttpServerProps } from "../../src/http";
import * as nginx from "../../src/nginx";
import { ReactApp } from "../../src/nodejs";
import { deleteAllImages, deployIDFilter } from "../docker/common";
import { MockDeploy } from "../testlib";

class Final extends PrimitiveComponent<AnyProps> {
    static noPlugin = true;
}

const mockStyleNoHttpServer = <Style>
    {Service} {rule(({ handle: _h, ...props }) => <Final kind="Service" {...props} />)}
    {NetworkService} {rule(({ handle: _h, ...props }) => <Final kind="NetworkService" {...props} />)}
    {Container} {rule(({ handle: _h, ...props }) => <Final kind="Container" {...props} />)}
</Style>;

const mockStyle = concatStyles(mockStyleNoHttpServer,
    <Style>
        {HttpServer} {rule<HttpServerProps>(({ handle: _h, ...props }) =>
            <nginx.HttpServer {...props} />)}
    </Style>);

const getNet = <Style>{Final}[kind=NetworkService] {Adapt.rule()}</Style>;
const getImage = <Style>{LocalDockerImage} {Adapt.rule()}</Style>;

async function checkDockerRun(image: string, cmd: string[] = []) {
    const { stdout } = await execa("docker", ["run", "--rm", image, ...cmd]);
    return stdout;
}

describe("ReactApp", function () {
    let mockDeploy: MockDeploy;
    let pluginDir: string;

    this.timeout(60 * 1000);
    this.slow(10 * 1000);

    mochaTmpdir.all("adapt-cloud-reactapp");

    before(async () => {
        pluginDir = path.join(process.cwd(), "plugins");
        await fs.writeJson("package.json", {
            main: "index.js",
            scripts: {
                build: "mkdir -p build && echo contents > build/file1"
            }
        });
    });

    after(async function () {
        this.timeout(60 * 1000);
        await deleteAllImages(deployIDFilter(mockDeploy.deployID));
    });

    beforeEach(async () => {
        await fs.remove(pluginDir);
        mockDeploy = new MockDeploy({
            pluginCreates: [createActionPlugin],
            tmpDir: pluginDir,
            uniqueDeployID: true,
        });
        await mockDeploy.init();
    });

    it("Should build a container and network service", async () => {
        const hand = handle();
        const orig = <ReactApp handle={hand} srcDir="." />;
        const { dom } = await mockDeploy.deploy(orig, { style: mockStyle });
        if (dom == null) throw should(dom).be.ok();

        let els = findElementsInDom(getNet, dom);
        should(els).have.length(1);
        should(els[0].props.scope).equal("cluster-internal");

        els = findElementsInDom(getImage, dom);
        should(els).have.length(2);
        const appImageEl = els.filter((el) => el.props.options.imageName === "react-app")[0];
        should(appImageEl).be.ok();

        const nginxImageEl = els.filter((el) => el.props.options.imageName === "nginx-static")[0];
        should(nginxImageEl).be.ok();
        const imageInfo = callInstanceMethod<ImageRef | undefined>(
            nginxImageEl.props.handle, undefined, "latestImage");
        if (imageInfo == null) throw should(imageInfo).be.ok();
        if (!hasId(imageInfo)) throw should(imageInfo.id).be.a.String();

        // Check that the nginx image got the file "built" in the app image
        const out = await checkDockerRun(imageInfo.id, ["cat", "/www/static/file1"]);
        should(out).equal("contents");
    });

    it("Should not build without HttpServer style", async () => {
        const hand = handle();
        const orig = <ReactApp handle={hand} srcDir="." />;
        return should(mockDeploy.deploy(orig, { style: mockStyleNoHttpServer }))
            .rejectedWith(/HttpServer/);
    });
});
