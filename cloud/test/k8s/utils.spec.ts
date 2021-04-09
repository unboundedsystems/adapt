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

import { mochaTmpdir } from "@adpt/testutils";
import * as fs from "fs-extra";
import * as yaml from "js-yaml";
import * as path from "path";
import should from "should";
import { Kubeconfig, makeClusterInfo } from "../../src/k8s";

describe("makeClusterInfo Tests", () => {
    const kubeconfig: Kubeconfig = {
        "apiVersion": "v1",
        "kind": "Config",
        "current-context": "foo",
        "contexts": [{
            name: "foo",
            context: {
                cluster: "foo.cluster.io",
                user: "bar"
            }
        }],
        "preferences": {},
        "users": [{
            name: "bar",
            user: {}
        }],
        "clusters": []
        //Improve object when we have better validation for Kubeconfig
    };

    mochaTmpdir.each("makeClusterInfo");

    let savedKUBECONFIG: string | undefined;

    beforeEach(() => {
        savedKUBECONFIG = process.env.KUBECONFIG;
    });

    afterEach(() => {
        if (savedKUBECONFIG) process.env.KUBECONFIG = savedKUBECONFIG;
    });

    it("Should return kubeconfig from  literal object", async () => {
        const registryPrefix = "foo";
        const info = await makeClusterInfo({ kubeconfig, registryPrefix });
        should(info).eql({ kubeconfig, registryPrefix });
    });

    it("Should return kubeconfig from JSON", async () => {
        const kubeconfigJSON = JSON.stringify(kubeconfig);
        const info = await makeClusterInfo({ kubeconfig: kubeconfigJSON });
        should(info).eql({ kubeconfig, registryPrefix: undefined });
    });

    it("Should return kubeconfig from YAML", async () => {
        const kubeconfigYAML = yaml.safeDump(kubeconfig);
        const info = await makeClusterInfo({ kubeconfig: kubeconfigYAML });
        should(info).eql({ kubeconfig, registryPrefix: undefined });
    });

    it("Should return kubeconfig from path", async () => {
        await fs.writeFile("conf.json", JSON.stringify(kubeconfig));
        const loc = path.join(process.cwd(), "conf.json");
        const info = await makeClusterInfo({ kubeconfig: loc });
        should(info).eql({ kubeconfig, registryPrefix: undefined });
    });

    it("Should return kubeconfig from KUBECONFIG", async function () {
        this.timeout("20s");

        await fs.writeFile("conf.json", JSON.stringify(kubeconfig));
        const loc = path.join(process.cwd(), "conf.json");
        process.env.KUBECONFIG = loc;
        const info = await makeClusterInfo({});
        should(info).eql({ kubeconfig, registryPrefix: undefined });
    });
});
