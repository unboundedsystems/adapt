/*
 * Copyright 2018-2019 Unbounded Systems, LLC
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
    AdaptMountedElement,
    Group,
    rule,
    Style,
} from "@adpt/core";
import {
    mochaTmpdir,
    TODO_platform,
} from "@adpt/testutils";
import fs from "fs-extra";
import path from "path";
import should from "should";

import { createActionPlugin } from "../src/action/action_plugin";
import {
    Container,
    ContainerProps,
    ContainerStatus,
} from "../src/Container";
import { DockerContainer } from "../src/docker";
import {
    Environment,
    lookupEnvVar,
    renameEnvVars,
    updateEnvVars
} from "../src/env";
import { deleteAllContainers, deployIDFilter } from "./docker/common";
import { MockDeploy, smallDockerImage } from "./testlib";

describe("Container component", () => {
    let mockDeploy: MockDeploy;
    let pluginDir: string;

    mochaTmpdir.all("adapt-test-Container");

    before(() => {
        pluginDir = path.join(process.cwd(), "plugins");
    });

    beforeEach(async () => {
        await fs.remove(pluginDir);
        mockDeploy = new MockDeploy({
            pluginCreates: [createActionPlugin],
            tmpDir: pluginDir,
            uniqueDeployID: true
        });
        await mockDeploy.init();
    });

    afterEach(async function () {
        this.timeout(20 * 1000);
        await deleteAllContainers(deployIDFilter(mockDeploy.deployID));
    });

    async function getContainerStatus(orig: AdaptMountedElement): Promise<ContainerStatus> {
        const status = await orig.status<any>();
        should(status).be.type("object");
        should(status.childStatus).have.length(1);
        const ctrStatus: ContainerStatus = status.childStatus[0];
        return ctrStatus;
    }

    it("Should build with local style and have status", async function () {
        // TODO: This test errors without output on Windows and needs fixed
        TODO_platform(this, "win32");

        this.timeout("60s");

        const root =
            <Group>
                <Container
                    name="unused"
                    image={smallDockerImage}
                    command="sleep 100000"
                    autoRemove={true}
                    stopSignal="SIGKILL"
                />
            </Group>;
        const style =
            <Style>
                {Container} {rule<ContainerProps>(({ handle, ...props }) => <DockerContainer {...props} />)}
            </Style>;

        const { dom, mountedOrig } = await mockDeploy.deploy(root, { style });
        if (dom == null) throw should(dom).not.be.Null();
        if (mountedOrig == null) throw should(mountedOrig).not.be.Null();

        let ctrStatus = await getContainerStatus(mountedOrig);
        should(ctrStatus).be.type("object");
        should(ctrStatus.Config.Image).equal(smallDockerImage);
        should(ctrStatus.Path).equal("sleep");
        should(ctrStatus.Args).eql(["100000"]);
        should(ctrStatus.State.Status).equal("running");

        let name = ctrStatus.Name;
        should(name).be.a.String().and.startWith("/");
        name = name.slice(1);

        // Delete the container without telling Adapt
        await deleteAllContainers(deployIDFilter(mockDeploy.deployID));

        ctrStatus = await getContainerStatus(mountedOrig);
        should(ctrStatus).eql({ noStatus: `No such container: ${name}` });
    });
});

describe("lookupEnvVar Tests", () => {
    it("should lookup in SimpleEnv style Environment object", () => {
        const env = {
            FOO: "fooval",
            BAR: "barval"
        };

        should(lookupEnvVar(env, "FOO")).equal("fooval");
        should(lookupEnvVar(env, "BAR")).equal("barval");
        should(lookupEnvVar(env, "BAZ")).Undefined();
    });

    it("should lookup in an EnvPair[] style Environment object", () => {
        const env = [
            { name: "FOO", value: "fooval" },
            { name: "BAR", value: "barval" }
        ];

        should(lookupEnvVar(env, "FOO")).equal("fooval");
        should(lookupEnvVar(env, "BAR")).equal("barval");
        should(lookupEnvVar(env, "BAZ")).Undefined();
    });
});

describe("updateEnvVars Tests", () => {
    function upd(name: string, value: string) {
        switch (name) {
            case "FOO": return { name: "NEW_FOO", value: "newfooval" };
            case "BAR": return { name: "NEW_BAR", value };
            case "BAZ": return { name, value: "newbazval" };
            case "REMOVE": return undefined;
            default: return { name, value };
        }
    }

    it("should update names and values in SimpleEnv style Environment object", () => {
        const orig: Environment = {
            FOO: "fooval",
            BAR: "barval",
            BAZ: "bazval",
            REMOVE: "oldval",
            NOTOUCH: "origval"
        };

        const xformed = updateEnvVars(orig, upd);

        should(xformed).eql({
            NEW_FOO: "newfooval",
            NEW_BAR: "barval",
            BAZ: "newbazval",
            NOTOUCH: "origval"
        });
    });

    it("should update names and values in EnvPair[] style Environment object", () => {
        const orig: Environment = [
            { name: "FOO", value: "fooval" },
            { name: "BAR", value: "barval" },
            { name: "BAZ", value: "bazval" },
            { name: "REMOVE", value: "oldval" },
            { name: "NOTOUCH", value: "origval" }
        ];

        const xformed = updateEnvVars(orig, upd);

        should(xformed).eql([
            { name: "NEW_FOO", value: "newfooval" },
            { name: "NEW_BAR", value: "barval" },
            { name: "BAZ", value: "newbazval" },
            { name: "NOTOUCH", value: "origval" }
        ]);
    });
});

describe("renameEnvVars Tests", () => {
    const mapping = {
        BAR: "NEW_BAR",
        BAZ: "NEW_BAZ"
    };

    it("should rename SimpleEnv style Environment object", () => {
        const orig: Environment = {
            FOO: "fooval",
            BAR: "barval",
            BAZ: "bazval"
        };

        const xformed = renameEnvVars(orig, mapping);

        should(xformed).eql({
            FOO: "fooval",
            NEW_BAR: "barval",
            NEW_BAZ: "bazval"
        });
    });

    it("should rename EnvPair[] style Environment objects", () => {
        const orig: Environment = [
            { name: "FOO", value: "fooval" },
            { name: "BAR", value: "barval" },
            { name: "BAZ", value: "bazval" }
        ];

        const xformed = renameEnvVars(orig, mapping);

        should(xformed).eql([
            { name: "FOO", value: "fooval" },
            { name: "NEW_BAR", value: "barval" },
            { name: "NEW_BAZ", value: "bazval" }
        ]);
    });
});
