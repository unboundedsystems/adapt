import Adapt, {
    Action,
    AdaptElement,
    AdaptMountedElement,
    build,
    ChangeType,
    createStateStore,
    Group,
    rule,
    Style,
} from "@adpt/core";
import {
    createMockLogger,
    dockerutils,
    mochaTmpdir,
} from "@adpt/testutils";
import Docker = require("dockerode");
import fs from "fs-extra";
import path from "path";
import should from "should";

import {
    AnsibleDockerHost,
    ansibleHostLocal,
    Container as AContainer,
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

    async function runPlugin(dom: AdaptElement, checkActions: (actions: Action[]) => void) {
        const dataDir = path.join(process.cwd(), "pluginData");
        const plugin = createAnsiblePlugin();
        const logger = createMockLogger();
        const options = {
            deployID: "abc123",
            log: logger.info,
            logger,
            dataDir,
        };

        await fs.ensureDir(dataDir);
        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        await act(actions);
        checkActions(actions);
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
                {Container} {rule<ContainerProps>(({handle, ...props}) => <AContainer {...props} />)}
            </Style>;
        const stateStore = createStateStore();
        const { mountedOrig, contents: dom } = await build(root, style, { stateStore });

        if (mountedOrig == null) throw should(mountedOrig).not.be.Null();
        if (dom == null) throw should(dom).not.be.Null();

        let ctrStatus = await getContainerStatus(mountedOrig);
        should(ctrStatus).eql({ noStatus: `No such container: ${name}` });

        await runPlugin(dom, (actions) => {
            should(actions.length).equal(2);

            should(actions[0].detail).equal("Executing Playbook");
            should(actions[0].changes).have.length(1);
            should(actions[0].changes[0].type).equal(ChangeType.create);
            should(actions[0].changes[0].detail).equal("Executing Playbook");
            should(actions[0].changes[0].element.componentName).equal("AnsiblePlaybook");

            should(actions[1].detail).equal("Executing Playbook");
            should(actions[1].changes).have.length(3);
            should(actions[1].changes[0].type).equal(ChangeType.create);
            should(actions[1].changes[0].detail).equal("Executing Playbook");
            should(actions[1].changes[0].element.componentName).equal("AnsibleImplicitPlaybook");
            should(actions[1].changes[1].type).equal(ChangeType.create);
            should(actions[1].changes[1].detail).equal("Executing Playbook");
            should(actions[1].changes[1].element.componentName).equal("AnsibleRole");
            should(actions[1].changes[2].type).equal(ChangeType.create);
            should(actions[1].changes[2].detail).equal("Executing Playbook");
            should(actions[1].changes[2].element.componentName).equal("AnsibleRole");
        });

        ctrStatus = await getContainerStatus(mountedOrig);
        should(ctrStatus).be.type("object");
        should(ctrStatus.Name).equal("/" + name);
        should(ctrStatus.Path).equal("sleep");
        should(ctrStatus.Args).eql(["100000"]);
        should(ctrStatus.State.Status).equal("running");
    });
});
