import Adapt, {
    AdaptElement,
    AdaptMountedElement,
    build,
    createStateStore,
    Group,
    rule,
    Style,
} from "@usys/adapt";
import {
    createMockLogger,
    dockerutils,
    mochaTmpdir,
} from "@usys/testutils";
import Docker = require("dockerode");
import fs from "fs-extra";
import path from "path";
import should from "should";

import {
    AnsibleContainer,
    AnsibleDockerHost,
    ansibleHostLocal,
    createAnsiblePlugin
} from "../src/ansible";
import { Container, ContainerProps, ContainerStatus } from "../src/Container";
import { act, randomName } from "./testlib";

const { deleteContainer } = dockerutils;

describe("Container component", () => {
    const docker = new Docker({ socketPath: "/var/run/docker.sock" });
    let name: string;

    mochaTmpdir.all("adapt-test-Container");

    beforeEach(() => {
        name = randomName("adapt-cloud-test");
    });

    afterEach(async () => {
        await deleteContainer(docker, name);
    });

    async function runPlugin(dom: AdaptElement) {
        const dataDir = path.join(process.cwd(), "pluginData");
        const plugin = createAnsiblePlugin();
        const logger = createMockLogger();
        const options = {
            deployID: "abc123",
            log: logger.info,
            dataDir,
        };

        await fs.ensureDir(dataDir);
        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        await act(actions);
        await plugin.finish();
    }

    async function getContainerStatus(orig: AdaptMountedElement): Promise<ContainerStatus> {
        const status = await orig.status<any>();
        should(status).be.type("object");
        should(status.childStatus).have.length(2);
        const ctrStatus: ContainerStatus = status.childStatus[0];
        return ctrStatus;
    }

    it("Should build with local style and have status", async function () {
        this.timeout(3 * 60 * 1000);
        this.slow(1 * 60 * 1000);
        const root =
            <Group>
                <Container
                    dockerHost="file:///var/run/docker.sock"
                    name={name}
                    image="busybox:latest"
                    command="sleep 100000"
                    autoRemove={true}
                    stopSignal="SIGKILL"
                />
                <AnsibleDockerHost ansibleHost={ansibleHostLocal} />
            </Group>;
        const style =
            <Style>
                {Container} {rule<ContainerProps>(({handle, ...props}) => <AnsibleContainer {...props} />)}
            </Style>;
        const stateStore = createStateStore();
        const { mountedOrig, contents: dom } = await build(root, style, { stateStore });

        if (mountedOrig == null) throw should(mountedOrig).not.be.Null();
        if (dom == null) throw should(dom).not.be.Null();

        let ctrStatus = await getContainerStatus(mountedOrig);
        should(ctrStatus).eql({ noStatus: `No such container: ${name}` });

        await runPlugin(dom);

        ctrStatus = await getContainerStatus(mountedOrig);
        should(ctrStatus).be.type("object");
        should(ctrStatus.Name).equal("/" + name);
        should(ctrStatus.Path).equal("sleep");
        should(ctrStatus.Args).eql(["100000"]);
        should(ctrStatus.State.Status).equal("running");
    });
});
