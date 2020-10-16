/*
 * Copyright 2019-2020 Unbounded Systems, LLC
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

import Adapt, { findElementsInDom, Group, handle, PrimitiveComponent, rule, Style } from "@adpt/core";
import { mochaTmpdir } from "@adpt/testutils";
import fs from "fs-extra";
import should from "should";
import { EnvPair, Service, ServiceProps } from "../../src";
import { ConnectToInstance } from "../../src/ConnectTo";
import { DockerImageInstance, imageRef, LocalDockerImage, LocalDockerImageProps } from "../../src/docker";
import { Kubeconfig, Resource, ServiceDeployment } from "../../src/k8s";
import { NodeService } from "../../src/nodejs";
import { doBuild } from "../testlib";

const imageSha1 = "sha256:6858809bf669cc5da7cb6af83d0fae838284d12e1be0182f92f6bd96559873e3";

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
        return this.image();
    }
}

interface ProviderProps {
    connectEnv: ConnectToInstance["connectEnv"];
}
class Provider extends PrimitiveComponent<ProviderProps> {
    connectEnv() {
        return this.props.connectEnv();
    }
}

const kconfig: Kubeconfig = {} as any;
const k8sStyle =
    <Style>
        {Service} {rule<ServiceProps>(({ handle: _h, ...props }) =>
            <ServiceDeployment config={{ kubeconfig: kconfig }} {...props} />)}
        {LocalDockerImage} {rule(() => <MockDockerImage />)}
    </Style>;

const getDeployments = <Style>{Resource}[kind=Deployment] {Adapt.rule()}</Style>;

function sortEnv(env: EnvPair[]) {
    return env.sort((a, b) => a.name === b.name ? 0 : a.name < b.name ? -1 : 1);
}

describe("NodeService", () => {
    mochaTmpdir.all("adapt-cloud-nodeservice");

    before(async () => {
        await fs.writeJson("package.json", {
            main: "index.js"
        });
    });

    it("Should merge env vars from connectTo", async () => {
        const [h1, h2] = [handle(), handle()];
        const orig =
            <Group>
                <Provider key="1" handle={h1} connectEnv={() => ({ A: "1", B: "1", C: "1" })} />
                <Provider key="2" handle={h2} connectEnv={() => ({ B: "2", C: "2" })} />
                <NodeService connectTo={[h1, h2]} srcDir="." env={{ C: "3" }} />
            </Group>;

        const { dom } = await doBuild(orig, { style: k8sStyle });
        const els = findElementsInDom(getDeployments, dom);
        should(els).have.length(1);
        const spec = els[0].props.spec;
        should(spec).not.Undefined;
        should(spec.template).not.Undefined();
        should(spec.template.spec).not.Undefined();
        should(spec.template.spec.containers).length(1);
        const env = sortEnv(spec.template.spec.containers[0].env);
        should(env).eql([
            { name: "A", value: "1" },
            { name: "B", value: "2" },
            { name: "C", value: "3" },
            { name: "HTTP_PORT", value: "8080" },
        ]);
    });
});
