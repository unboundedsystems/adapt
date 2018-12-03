import Docker = require("dockerode");
import * as randomstring from "randomstring";
import should from "should";
import {
    addToNetwork,
    createNetwork,
    //dockerExec,
    dockerPull,
    //getNetwork,
    removeFromNetwork,
    //waitFor,
} from "../src/dockerutils";

function makeName() {
    const rand = randomstring.generate({
        length: 5,
        charset: "alphabetic",
        readable: true,
        capitalization: "lowercase",
    });
    return `adapt-test-dockerutils-${rand}`;
}

const image = "busybox:latest";

function dockerOpts(name: string): Docker.ContainerCreateOptions {
    return {
        name,
        AttachStdin: false,
        AttachStdout: false,
        AttachStderr: false,
        Cmd: [ "sleep", "10000" ],
        Tty: false,
        OpenStdin: false,
        StdinOnce: false,
        StopSignal: "SIGKILL",
        HostConfig: {
            AutoRemove: true,
        },
        Env: [],
        Image: image,
        Volumes: {},
    };
}

describe("dockerutils networking", () => {
    const undo: (() => any)[] = [];
    const docker = new Docker({ socketPath: "/var/run/docker.sock" });
    let name: string;
    let network: Docker.Network;
    let container: Docker.Container;

    before("setup dockerutils", async function () {
        this.timeout(20 * 1000);
        name = makeName();
        network = await createNetwork(docker, name);
        undo.push(async () => network.remove());
        await dockerPull(docker, image, "      ");
        container = await docker.createContainer(dockerOpts(name));
        await container.start();
        undo.push(async () => container.stop());
    });

    after("cleanup dockerutils", async function () {
        this.timeout(20 * 1000);
        while (true) {
            const act = undo.pop();
            if (!act) break;
            await act();
        }
    });

    it("Should connect and remove from network", async () => {
        let info = await container.inspect();
        should(info.NetworkSettings.Networks[name]).be.Undefined();

        await addToNetwork(container, network);
        info = await container.inspect();
        should(info.NetworkSettings.Networks[name]).be.type("object");
        should(info.NetworkSettings.Networks[name].NetworkID).be.type("string");

        await removeFromNetwork(container, network);
        info = await container.inspect();
        should(info.NetworkSettings.Networks[name]).be.Undefined();
    });

    it("Should not error if already connected", async () => {
        let info = await container.inspect();
        should(info.NetworkSettings.Networks[name]).be.Undefined();

        await addToNetwork(container, network);
        info = await container.inspect();
        should(info.NetworkSettings.Networks[name]).be.type("object");
        should(info.NetworkSettings.Networks[name].NetworkID).be.type("string");

        await addToNetwork(container, network);
        await removeFromNetwork(container, network);
    });
});
