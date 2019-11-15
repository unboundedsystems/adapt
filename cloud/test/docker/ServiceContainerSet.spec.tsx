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

import Adapt, { rule, Style } from "@adpt/core";
import { minikube, mochaTmpdir } from "@adpt/testutils";
import fs from "fs-extra";
import path from "path";
import should from "should";
import { createActionPlugin } from "../../src/action/action_plugin";
import { mkInstance } from "../run_minikube";
import { MockDeploy } from "../testlib";
import { deleteAllContainers, deleteAllImages, deployIDFilter } from "./common";

import { Service, ServiceProps } from "../../src";
import {
    ServiceContainerSet,
} from "../../src/docker";
import { NodeService } from "../../src/nodejs";

const nodeIndexJs =
`
const express = require('express');

let port = Number(process.env.HTTP_PORT);
if (isNaN(port)) port = 8080;

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Hello World! Container port=' + port);
});
const svr = app.listen(port);

// Graceful shutdown
process.on('SIGTERM', () => svr.close());
`;

const nodePackage = {
    name: "hello-node",
    description: "Hello World",
    version: "0.1.0",
    main: "index.js",
    dependencies: {
        express: "^4.17.1"
    },
    scripts: {
        build: ":"
    }
};

describe("ServiceContainerSet", function () {
    let mockDeploy: MockDeploy;
    let pluginDir: string;
    let dindInfo: minikube.MinikubeInfo; // Use the dind instance our k3s container has
    let dockerHost: string;

    this.timeout(80 * 1000);
    this.slow(4 * 1000);

    mochaTmpdir.all(`adapt-cloud-servicecontainerset`);

    before(async () => {
        this.timeout(mkInstance.setupTimeoutMs);
        pluginDir = path.join(process.cwd(), "plugins");
        await fs.ensureDir("backend");
        await fs.writeFile(path.join("backend", "index.js"), nodeIndexJs);
        await fs.writeJSON(path.join("backend", "package.json"), nodePackage);
        dindInfo = await mkInstance.info;
        dockerHost = dindInfo.hostname;
        mockDeploy = new MockDeploy({
            pluginCreates: [createActionPlugin],
            tmpDir: pluginDir,
            uniqueDeployID: true
        });
        await mockDeploy.init();
    });

    after(async function () {
        this.timeout(20 * 1000);
        const filter = deployIDFilter(mockDeploy.deployID);
        await deleteAllContainers(filter, { dockerHost });
        await deleteAllImages(filter, { dockerHost });
    });

    const simpleStyle = () =>
        <Style>
            {Service}
            {rule<ServiceProps>(({ handle: _h, ...props }) =>
                <ServiceContainerSet dockerHost={dockerHost} {...props} />)}
        </Style>;

    it("Should internal scope NetworkService not allow localhost connection", async () => {
        const orig =
            <NodeService
                srcDir="./backend"
                port={5959}
                buildOptions={{ dockerHost }}
                />;
        const style = simpleStyle();
        await mockDeploy.deploy(orig, { style });

        // Test localhost connection from inside the dind container
        await should(dindInfo.exec([ "wget", "-O-", "http://127.0.0.1:5959/"]))
            .be.rejectedWith(/can't connect to remote host \(127.0.0.1\): Connection refused/);
    });

    it("Should external scope NetworkService allow localhost connection", async () => {
        const orig =
            <NodeService
                srcDir="./backend"
                scope="external"
                externalPort={5959}
                port={5959}
                buildOptions={{ dockerHost }}
                />;
        const style = simpleStyle();
        await mockDeploy.deploy(orig, { style });

        // Test localhost connection from inside the dind container
        const resp = await dindInfo.exec([ "wget", "-O-", "http://127.0.0.1:5959/"]);
        should(resp).equal(`Hello World! Container port=5959`);
    });

    it("Should external scope NetworkService allow translating port numbers", async () => {
        const orig =
            <NodeService
                srcDir="./backend"
                scope="external"
                externalPort={2020}
                port={5959}
                buildOptions={{ dockerHost }}
                />;
        const style = simpleStyle();
        await mockDeploy.deploy(orig, { style });

        // Test localhost connection from inside the dind container
        const resp = await dindInfo.exec([ "wget", "-O-", "http://127.0.0.1:2020/"]);
        should(resp).equal(`Hello World! Container port=5959`);
    });

    it("Should internal scope NetworkService disallow translating port numbers", async () => {
        const orig =
            <NodeService
                srcDir="./backend"
                scope="cluster-internal"
                externalPort={2020}
                port={5959}
                buildOptions={{ dockerHost }}
                />;
        const style = simpleStyle();

        await should(mockDeploy.deploy(orig, { style }))
            .be.rejectedWith(/DOM build failed.*Port number translation currently only supported/s);
    });
});
