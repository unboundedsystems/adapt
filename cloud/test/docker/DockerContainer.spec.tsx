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

import Adapt, { AdaptElement, childrenToArray, Group, handle } from "@adpt/core";
import { mochaTmpdir } from "@adpt/testutils";
import fs from "fs-extra";
import { sortedUniq } from "lodash";
import path from "path";
import should from "should";
import { createActionPlugin } from "../../src/action/action_plugin";
import { MockDeploy, smallDockerImage } from "../testlib";
import { deleteAllContainers, deleteAllImages, deleteAllNetworks, deployIDFilter } from "./common";

import { sleep } from "@adpt/utils";
import { ContainerLabels, EnvSimple, MountStatus, PortBinding, PortDescription } from "../../src";
import {
    adaptDockerDeployIDKey,
    computeContainerName,
    DockerContainer,
    LocalDockerImage,
    Mount,
} from "../../src/docker";
import {
    dockerImageId,
    dockerInspect,
    execDocker,
    InspectReport
} from "../../src/docker/cli";

describe("DockerContainer", function () {
    let mockDeploy: MockDeploy;
    let pluginDir: string;
    let emptyDir: string;
    let testNet1: string;
    let testNet2: string;

    this.timeout(2 * 60 * 1000);
    this.slow(4 * 1000);

    mochaTmpdir.all(`adapt-cloud-dockercontainer`);

    before(async () => {
        pluginDir = path.join(process.cwd(), "plugins");
        emptyDir = path.join(process.cwd(), "empty");
        await fs.mkdir(emptyDir);
    });

    afterEach(async function () {
        this.timeout(20 * 1000);
        const filter = deployIDFilter(mockDeploy.deployID);
        await deleteAllContainers(filter);
        await deleteAllNetworks(filter);
        await deleteAllImages(filter);
    });

    beforeEach(async () => {
        await fs.remove(pluginDir);
        mockDeploy = new MockDeploy({
            pluginCreates: [createActionPlugin],
            tmpDir: pluginDir,
            uniqueDeployID: true
        });
        await mockDeploy.init();

        async function createDockerNetwork(prefix: string) {
            const netName = prefix + "-" + mockDeploy.deployID;
            await execDocker(["network", "create", netName, "--label", `${adaptDockerDeployIDKey}=${mockDeploy.deployID}`], {});
            return netName;
        }
        testNet1 = await createDockerNetwork("testNet1");
        testNet2 = await createDockerNetwork("testNet2");
    });

    it("Should create and destroy a container with a string image", async () => {
        const imageName = "alpine:3.8";
        const orig = <DockerContainer key="myctr" image="alpine:3.8" />;

        //Create
        const { dom } = await mockDeploy.deploy(orig);
        if (dom == null) throw should(dom).not.be.Null();

        const contName = computeContainerName(dom.props.key, dom.id, dom.buildData.deployID);
        should(contName).startWith("myctr-");

        const infos = await dockerInspect([contName], { type: "container" });
        should(infos).be.Array().of.length(1);
        const info = infos[0];
        if (info === undefined) throw should(info).not.Undefined();

        should(info.Name).equal(`/${contName}`);
        const id = await dockerImageId(imageName);
        should(info.Image).equal(id);

        //Delete
        await mockDeploy.deploy(null);
        const finalInfos = await dockerInspect([contName]);
        should(finalInfos).be.Array().of.length(0);
    });

    function getEnvValue(info: InspectReport, key: string) {
        const envArray = info.Config.Env;
        for (const e of envArray) {
            const eql = e.indexOf("=");
            if (eql === -1) throw new Error(`No equal sign in env var`);
            if (key === e.slice(0, eql)) return e.slice(eql + 1);
        }
        return undefined;
    }

    interface BuildGetOpts {
        delaySec?: number;
    }

    async function buildAndGetInfo(orig: AdaptElement, opts: BuildGetOpts = {}) {
        const { dom } = await mockDeploy.deploy(orig);
        if (dom == null) throw should(dom).not.be.Null();

        const ctrElem = childrenToArray(dom.props.children)[0];
        const contName = computeContainerName(ctrElem.props.key, ctrElem.id, mockDeploy.deployID);

        if (opts.delaySec) await sleep(opts.delaySec * 1000);
        const infos = await dockerInspect([contName], { type: "container" });
        should(infos).be.Array().of.length(1);
        const info = infos[0];
        if (info == null) throw should(info).be.ok();

        should(info.Id).be.a.String();
        should(info.Name).equal(`/${contName}`);

        return info;
    }

    async function deployAndCheckEnv(env: EnvSimple) {
        const orig =
            <Group>
                <DockerContainer image="alpine:3.8" environment={env} />
            </Group>;
        const info = await buildAndGetInfo(orig);

        // Image includes one ENV: PATH
        should(getEnvValue(info, "PATH")).be.a.String();

        for (const key of Object.keys(env)) {
            should(getEnvValue(info, key))
                .equal(env[key], `Incorrect value for key ${key}`);
        }
        should(info.Config.Env).have.length(1 + Object.keys(env).length);

        return info;
    }

    it("Should set environment variables on container and replace on change", async () => {
        let info = await deployAndCheckEnv({ FOO: "foo", BAR: "bar" });
        let lastId = info.Id;

        // Update env value => replace
        info = await deployAndCheckEnv({ FOO: "foo2", BAR: "bar" });
        should(info.Id).not.equal(lastId); // Check for replaced container
        lastId = info.Id;

        // Delete env value => replace
        info = await deployAndCheckEnv({ BAR: "bar" });
        should(info.Id).not.equal(lastId); // Check for replaced container
    });

    async function deployAndCheckLabels(labels: ContainerLabels) {
        const img = handle();
        const orig =
            <Group>
                <DockerContainer image={img} labels={labels} />
                <LocalDockerImage handle={img} contextDir={emptyDir} dockerfile={`
                    FROM ${smallDockerImage}
                    LABEL testlabel=testing
                `} />
            </Group>;
        const info = await buildAndGetInfo(orig);

        const actual = info.Config.Labels;
        const expected = {
            testlabel: "testing",
            ...labels,
            [adaptDockerDeployIDKey]: mockDeploy.deployID,
        };

        should(actual).eql(expected);
        return info;
    }

    it("Should set labels on container and replace on change", async () => {
        let info = await deployAndCheckLabels({ FOO: "foo", BAR: "bar" });
        let lastId = info.Id;

        // Update label value => replace
        info = await deployAndCheckLabels({ FOO: "foo2", BAR: "bar" });
        should(info.Id).not.equal(lastId); // Check for replaced container
        lastId = info.Id;

        // Delete env value => replace
        info = await deployAndCheckLabels({ BAR: "bar" });
        should(info.Id).not.equal(lastId); // Check for replaced container
    });

    const toPortStr = (p: PortDescription) =>
        typeof p === "string"  && p.includes("/") ? p : `${p}/tcp`;

    async function deployAndCheckPorts(ports: PortDescription[] | undefined) {
        const img = handle();
        const orig =
            <Group>
                <DockerContainer image={img} ports={ports} />
                <LocalDockerImage handle={img} contextDir={emptyDir} dockerfile={`
                    FROM ${smallDockerImage}
                    EXPOSE 9999
                `} />
            </Group>;
        const info = await buildAndGetInfo(orig);

        if (info.Config.ExposedPorts == null) throw should(info.Config.ExposedPorts).be.ok();
        const actual = Object.keys(info.Config.ExposedPorts).sort();
        const expected = [
            "9999/tcp",
            ...(ports || []).map(toPortStr)
        ].sort();

        should(actual).eql(expected);
        return info;
    }

    it("Should expose ports on container and replace on change", async () => {
        let info = await deployAndCheckPorts([1212]);
        let lastId = info.Id;

        // Add port => replace
        info = await deployAndCheckPorts([3434, 1212]);
        should(info.Id).not.equal(lastId); // Check for replaced container
        lastId = info.Id;

        // Delete ports => replace
        info = await deployAndCheckPorts(undefined);
        should(info.Id).not.equal(lastId); // Check for replaced container
    });

    async function deployAndCheckPortBindings(bindings: PortBinding | undefined) {
        const img = handle();
        const orig =
            <Group>
                <DockerContainer image={img} portBindings={bindings} />
                <LocalDockerImage handle={img} contextDir={emptyDir} dockerfile={`
                    FROM ${smallDockerImage}
                    EXPOSE 9999
                `} />
            </Group>;
        const info = await buildAndGetInfo(orig);

        if (info.Config.ExposedPorts == null) throw should(info.Config.ExposedPorts).be.ok();
        const actualExposed = Object.keys(info.Config.ExposedPorts).sort();
        const expectedExposed = sortedUniq([
            "9999/tcp",
            ...Object.keys(bindings || {}).map(toPortStr),
        ].sort());
        should(actualExposed).eql(expectedExposed);

        const expected: any = {};
        if (bindings) {
            Object.keys(bindings).forEach((p) => {
                expected[toPortStr(p)] = [{
                    HostIp: "",
                    HostPort: `${bindings[p]}`
                }];
            });
        }
        should(info.HostConfig.PortBindings).eql(expected);
        return info;
    }

    it("Should bind host ports on container and replace on change", async () => {
        let info = await deployAndCheckPortBindings({
            9998: 1000
        });
        let lastId = info.Id;

        // Add port => replace
        info = await deployAndCheckPortBindings({
            "9998": 1000,
            "1234/udp": 1212,
        });
        should(info.Id).not.equal(lastId); // Check for replaced container
        lastId = info.Id;

        // Change in format of input only
        info = await deployAndCheckPortBindings({
            "9998/tcp": 1000,
            "1234/udp": 1212,
        });
        should(info.Id).equal(lastId); // Check for NOT replaced container

        // Change host port
        info = await deployAndCheckPortBindings({
            "9998/tcp": 1001,
            "1234/udp": 1212,
        });
        should(info.Id).not.equal(lastId); // Check for replaced container
        lastId = info.Id;

        // Delete ports => replace
        info = await deployAndCheckPortBindings(undefined);
        should(info.Id).not.equal(lastId); // Check for replaced container
    });

    it("Should attach container to networks", async () => {
        const orig = <DockerContainer image="alpine:3.8" networks={[testNet1, testNet2]} />;

        const { dom } = await mockDeploy.deploy(orig);
        if (dom == null) throw should(dom).not.be.Null();
        const contName = computeContainerName(dom.props.key, dom.id, dom.buildData.deployID);

        const infos = await dockerInspect([contName], { type: "container" });
        should(infos).be.Array().of.length(1);
        const info = infos[0];
        if (info === undefined) throw should(info).not.Undefined();
        should(info.NetworkSettings.Networks).have.keys(testNet1, testNet2);
    });

    it("Should update networks on existing container", async () => {
        const orig = <DockerContainer image="alpine:3.8" networks={[testNet1, testNet2]} />;

        const { dom } = await mockDeploy.deploy(orig);
        if (dom == null) throw should(dom).not.be.Null();
        const contName = computeContainerName(dom.props.key, dom.id, dom.buildData.deployID);

        const infos = await dockerInspect([contName], { type: "container" });
        should(infos).be.Array().of.length(1);
        const info = infos[0];
        if (info === undefined) throw should(info).not.Undefined();
        should(info.NetworkSettings.Networks).have.keys(testNet1, testNet2);
        should(Object.keys(info.NetworkSettings.Networks)).have.length(2);

        //Remove testNet2 to see if removal update works
        const removeNet2 = <DockerContainer image="alpine:3.8" networks={[testNet1]} />;
        await mockDeploy.deploy(removeNet2);
        //Purposely look at old container name
        const infos2 = await dockerInspect([contName], { type: "container" });
        should(infos2).be.Array().of.length(1);
        const info2 = infos2[0];
        if (info2 === undefined) throw should(info2).not.Undefined();
        should(info2.NetworkSettings.Networks).have.keys(testNet1);
        should(info2.NetworkSettings.Networks).not.have.keys(testNet2);
        should(Object.keys(info2.NetworkSettings.Networks)).have.length(1);
        should(info2.Id).equal(info.Id); //Update not replace

        //Add the network back to see if update works
        await mockDeploy.deploy(orig);
        //Purposely look at old container name
        const infos3 = await dockerInspect([contName], { type: "container" });
        should(infos3).be.Array().of.length(1);
        const info3 = infos3[0];
        if (info3 === undefined) throw should(info2).not.Undefined();
        should(info3.NetworkSettings.Networks).have.keys(testNet1, testNet2);
        should(Object.keys(info3.NetworkSettings.Networks)).have.length(2);
        should(info3.Id).equal(info.Id); //Update not replace
    });

    it("Should attach to default network if all explicit networks are removed", async () => {
        const orig = <DockerContainer image="alpine:3.8" networks={[testNet1, testNet2]} />;

        const { dom } = await mockDeploy.deploy(orig);
        if (dom == null) throw should(dom).not.be.Null();
        const contName = computeContainerName(dom.props.key, dom.id, dom.buildData.deployID);

        const infos = await dockerInspect([contName], { type: "container" });
        should(infos).be.Array().of.length(1);
        const info = infos[0];
        if (info === undefined) throw should(info).not.Undefined();
        should(info.NetworkSettings.Networks).have.keys(testNet1, testNet2);

        //Remove networks to see if default becomes attached
        const removeNets = <DockerContainer image="alpine:3.8" />;
        await mockDeploy.deploy(removeNets);
        //Purposely look at old container name
        const infos2 = await dockerInspect([contName], { type: "container" });
        should(infos2).be.Array().of.length(1);
        const info2 = infos2[0];
        if (info2 === undefined) throw should(info2).not.Undefined();
        should(info2.NetworkSettings.Networks).not.have.keys(testNet1, testNet2);
        should(Object.keys(info2.NetworkSettings.Networks)).not.empty();
        should(info2.Id).equal(info.Id); //Update not replace
    });

    it("Should remove default networks if explict networks are listed", async () => {
        const orig = <DockerContainer image="alpine:3.8" />;

        const { dom } = await mockDeploy.deploy(orig);
        if (dom == null) throw should(dom).not.be.Null();
        const contName = computeContainerName(dom.props.key, dom.id, dom.buildData.deployID);

        const infos = await dockerInspect([contName], { type: "container" });
        should(infos).be.Array().of.length(1);
        const info = infos[0];
        if (info === undefined) throw should(info).not.Undefined();
        const netKeys = Object.keys(info.NetworkSettings.Networks);
        should(netKeys).length(1);
        const defaultNet = netKeys[0];

        //Add networks to see if default is removed
        const addNets = <DockerContainer image="alpine:3.8" networks={[testNet1, testNet2]} />;
        await mockDeploy.deploy(addNets);
        //Purposely look at old container name
        const infos2 = await dockerInspect([contName], { type: "container" });
        should(infos2).be.Array().of.length(1);
        const info2 = infos2[0];
        if (info2 === undefined) throw should(info2).not.Undefined();
        should(info2.NetworkSettings.Networks).have.keys(testNet1, testNet2);
        should(info2.NetworkSettings.Networks).not.have.keys(defaultNet);
        should(info2.Id).equal(info.Id); //Update not replace
    });

    it("Should attach container to networks by network id", async () => {
        const [testNet1Id, testNet2Id] =
            (await dockerInspect([testNet1, testNet2], { type: "network" })).map((i) => i.Id);
        const orig = <DockerContainer image="alpine:3.8" networks={[testNet1Id, testNet2Id]} />;

        const { dom } = await mockDeploy.deploy(orig);
        if (dom == null) throw should(dom).not.be.Null();
        const contName = computeContainerName(dom.props.key, dom.id, dom.buildData.deployID);

        const infos = await dockerInspect([contName], { type: "container" });
        should(infos).be.Array().of.length(1);
        const info = infos[0];
        if (info === undefined) throw should(info).not.Undefined();
        should(info.NetworkSettings.Networks).have.keys(testNet1, testNet2);
    });

    it("Should not restart container by default", async () => {
        const orig =
            <Group>
                <DockerContainer
                    image={smallDockerImage}
                />
            </Group>;
        const info = await buildAndGetInfo(orig, { delaySec: 1 });
        should(info.HostConfig.RestartPolicy).eql({ Name: "no", MaximumRetryCount: 0 });
        should(info.State.Status).equal("exited");
        should(info.State.Running).equal(false);
        should(info.State.Restarting).equal(false);
        should(info.RestartCount).equal(0);
        should(info.State.ExitCode).equal(0);
    });

    it("Should not restart container with Never", async () => {
        const orig =
            <Group>
                <DockerContainer
                    image={smallDockerImage}
                    restartPolicy={{ name: "Never" }}
                />
            </Group>;
        const info = await buildAndGetInfo(orig, { delaySec: 1 });
        should(info.HostConfig.RestartPolicy).eql({ Name: "no", MaximumRetryCount: 0 });
        should(info.State.Status).equal("exited");
        should(info.State.Running).equal(false);
        should(info.State.Restarting).equal(false);
        should(info.RestartCount).equal(0);
        should(info.State.ExitCode).equal(0);
    });

    it("Should restart container with Always", async function () {
        this.slow("5s");
        const orig =
            <Group>
                <DockerContainer
                    image={smallDockerImage}
                    restartPolicy={{ name: "Always" }}
                />
            </Group>;
        const info = await buildAndGetInfo(orig, { delaySec: 2 });
        should(info.HostConfig.RestartPolicy).eql({ Name: "always", MaximumRetryCount: 0 });
        should(info.State.Status).be.oneOf("running", "restarting");
        should(info.State.Running).equal(true);
        should(info.RestartCount).be.greaterThan(0);
        should(info.State.ExitCode).equal(0);
    });

    it("Should restart container on failure with OnFailure", async function () {
        this.slow("7s");
        const orig =
            <Group>
                <DockerContainer
                    image={smallDockerImage}
                    command="false"
                    restartPolicy={{ name: "OnFailure" }}
                />
            </Group>;
        const info = await buildAndGetInfo(orig, { delaySec: 3 });
        should(info.HostConfig.RestartPolicy).eql({ Name: "on-failure", MaximumRetryCount: 0 });
        should(info.State.Status).be.oneOf("running", "restarting");
        should(info.State.Running).equal(true);
        should(info.RestartCount).be.greaterThan(1);
        // Docker weirdness - ExitCode gets reset to 0 on restart
        should(info.State.ExitCode).be.oneOf(0, 1);
    });

    it("Should not restart container on success with OnFailure", async function () {
        this.slow("5s");
        const orig =
            <Group>
                <DockerContainer
                    image={smallDockerImage}
                    restartPolicy={{ name: "OnFailure" }}
                />
            </Group>;
        const info = await buildAndGetInfo(orig, { delaySec: 2 });
        should(info.HostConfig.RestartPolicy).eql({ Name: "on-failure", MaximumRetryCount: 0 });
        should(info.State.Status).equal("exited");
        should(info.State.Running).equal(false);
        should(info.State.Restarting).equal(false);
        should(info.RestartCount).equal(0);
        should(info.State.ExitCode).equal(0);
    });

    it("Should restart container max times on failure with OnFailure", async function () {
        this.slow("7s");
        const orig =
            <Group>
                <DockerContainer
                    image={smallDockerImage}
                    command="false"
                    restartPolicy={{ name: "OnFailure", maximumRetryCount: 1 }}
                />
            </Group>;
        const info = await buildAndGetInfo(orig, { delaySec: 3 });
        should(info.HostConfig.RestartPolicy).eql({ Name: "on-failure", MaximumRetryCount: 1 });
        should(info.State.Status).equal("exited");
        should(info.State.Running).equal(false);
        should(info.State.Restarting).equal(false);
        should(info.RestartCount).equal(1);
        should(info.State.ExitCode).equal(1);
    });

    const mountCompare = (a: MountStatus, b: MountStatus) =>
        a.Destination < b.Destination ? -1 : a.Destination > b.Destination ? 1 : 0;

    it("Should apply bind mounts", async () => {
        // tslint:disable-next-line: variable-name
        const Test = ({ mounts }: { mounts: Mount[] }) => (
            <Group>
                <DockerContainer
                    command="sleep 1000"
                    image={smallDockerImage}
                    mounts={mounts}
                    stopSignal="kill"
                />
            </Group>
        );
        let info = await buildAndGetInfo(
            <Test mounts={[
                {
                    type: "bind",
                    source: "/tmp",
                    destination: "/foo/bar",
                },
                {
                    type: "bind",
                    source: "/etc",
                    destination: "/foo/baz",
                },
            ]} />
        );
        let lastId = info.Id;

        // Check initial mounts
        should((info.Mounts || []).sort(mountCompare)).eql([
            {
                Type: "bind",
                Source: "/tmp",
                Destination: "/foo/bar",
                RW: true,
                Mode: "",
                Propagation: "rprivate",
            },
            {
                Type: "bind",
                Source: "/etc",
                Destination: "/foo/baz",
                RW: true,
                Mode: "",
                Propagation: "rprivate",
            },
        ]);

        // Change the order
        info = await buildAndGetInfo(
            <Test mounts={[
                {
                    type: "bind",
                    source: "/etc",
                    destination: "/foo/baz",
                },
                {
                    type: "bind",
                    source: "/tmp",
                    destination: "/foo/bar",
                },
            ]} />
        );
        should(info.Id).equal(lastId); // Changing order should not cause restart

        // Change readonly
        info = await buildAndGetInfo(
            <Test mounts={[
                {
                    type: "bind",
                    source: "/etc",
                    destination: "/foo/baz",
                    readonly: true,
                },
                {
                    type: "bind",
                    source: "/tmp",
                    destination: "/foo/bar",
                },
            ]} />
        );
        should(info.Id).not.equal(lastId); // Changing readonly should cause restart
        lastId = info.Id;
        should((info.Mounts || []).sort(mountCompare)).eql([
            {
                Type: "bind",
                Source: "/tmp",
                Destination: "/foo/bar",
                RW: true,
                Mode: "",
                Propagation: "rprivate",
            },
            {
                Type: "bind",
                Source: "/etc",
                Destination: "/foo/baz",
                RW: false,
                Mode: "",
                Propagation: "rprivate",
            },
        ]);

        // Delete a mount
        info = await buildAndGetInfo(
            <Test mounts={[
                {
                    type: "bind",
                    source: "/tmp",
                    destination: "/foo/bar",
                },
            ]} />
        );
        should(info.Id).not.equal(lastId); // Deleting bind should cause restart
        should((info.Mounts || []).sort(mountCompare)).eql([
            {
                Type: "bind",
                Source: "/tmp",
                Destination: "/foo/bar",
                RW: true,
                Mode: "",
                Propagation: "rprivate",
            },
        ]);
    });
});
