import Adapt, {
    AdaptElement,
    Group,
    PluginOptions,
} from "@usys/adapt";
import * as fs from "fs-extra";
import * as path from "path";
import should from "should";

import {
    createMockLogger,
    dockerMocha,
    installAnsible,
    mochaTmpdir,
    MockLogger,
} from "@usys/testutils";
// tslint:disable-next-line:no-submodule-imports
import { dockerExec } from "@usys/testutils/dist/src/dockerutils";
import { act, doBuild } from "../testlib";

import {
    AnsibleGroup,
    AnsibleHost,
    ansibleHostLocal,
    AnsiblePlaybook,
    AnsibleRole,
    Play,
} from "../../src/ansible";
import {
    AnsiblePluginImpl,
    createAnsiblePlugin,
} from "../../src/ansible/ansible_plugin";

const echoPlaybook = (hosts: string) => `
- name: Echo playbook
  hosts: ${hosts}
  vars:
    test_val: success
    output_file: test.output
  tasks:
  - name: Echo to a file
    shell: echo Test {{ test_val }} > {{ output_file }}
`;

const echoPlay = (hosts: string): Play => ({
    name: "Echo playbook object",
    hosts,
    vars: {
        test_val: "success",
        output_file: "test.output",
    },
    tasks: [
        {
            name: "Echo to a file",
            shell: "echo Test {{ test_val }} > {{ output_file }}",
        }
    ]
});

const sshPubKey = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAgQC1zw0/3r31bW/VrAhS" +
    "n4dAYsUZj5AZpj90b4zhAURzJjt60bucrTOFJ9kjVYU0zydEHMYLGlo8ZosfVwkazOy0lD" +
    "dcvFpxWX0gSwLC/le/GFVaXfuhtW+juOKxnnxSTjGIbL0/yRHhwIXP3Wv99Le8vf/Cp8ou" +
    "+ifmYaZsYmCqqw== CORP\\mark@a-1ltyzh42bbrmy";
const sshPrivKey =
`-----BEGIN RSA PRIVATE KEY-----
MIICXQIBAAKBgQC1zw0/3r31bW/VrAhSn4dAYsUZj5AZpj90b4zhAURzJjt60buc
rTOFJ9kjVYU0zydEHMYLGlo8ZosfVwkazOy0lDdcvFpxWX0gSwLC/le/GFVaXfuh
tW+juOKxnnxSTjGIbL0/yRHhwIXP3Wv99Le8vf/Cp8ou+ifmYaZsYmCqqwIDAQAB
AoGAGNH6ehS7lCzrjp0cycLToRua0uGBh67ljMzJy9HzeVDn392QIlSW6v/Eqgk7
1TjOoILZGpzvYr2REqc8K/d7/PQy3hpBqIdyvKlaeH3G1rXGZ2gzQL2JD/ZkQe3A
S7yhI2hBEwvwUtoTdg4pr3ryyiXdV88KG07dVdA2EcO0fYECQQDZZti0rN56h5iX
MRcmC4vUkMD45wIyI2WCBIgqfodB4Lrm7U39+85n8VFkOk0gpp3tAnnQR9F+l9oq
0xDFyujrAkEA1hZ3PIhwtDt8T9d0nWcccVEGvHlmSwWVWzqD7U3H7nKCAH2lI4v+
2QO8xkjn8ogtE1Qpq+B95uZpKXd7fjDVQQJACbFmNBgJC1mEWilcKNwW7fFOSUqz
dFzTp8pf79UYXr2QV7943LwfZc8Cm/9ldPE41Vpo5/prwsMufP5QHyF+5QJBAL3T
gbo8yKImtJ0ez5nZmZCoZa6sfhU7SClyAxRhCUvWYIsK3Whdc4T9GV8/udqFAGLJ
F4H9NeWMm+ZWuTs1FYECQQCuhea6pyQYRyujYY00MZ0XLFlaogVX1xl1vaqH2fIQ
JKRD4+pnZ0oPVmtLwHd7UCc7zQclJ6Uc8Ao95nrcVq+a
-----END RSA PRIVATE KEY-----
`;

async function setupDir() {
    await fs.writeFile("echo_all.yaml", echoPlaybook("all"));
    await fs.writeFile("echo_group1.yaml", echoPlaybook("group1"));
    await fs.writeFile("echo_localhost.yaml", echoPlaybook("localhost"));
}

const sshdContainerSpec: dockerMocha.ContainerSpec = {
    Image: "sickp/alpine-sshd:7.5-r2",
    Hostname: "sshd-test",
    ExposedPorts: { "22/tcp": {} },
    HostConfig: {
        PortBindings: {
            "22/tcp": [{ HostPort: "" }]
        }
    }
};

describe("Ansible plugin", async function () {
    this.timeout(10 * 1000);

    let plugin: AnsiblePluginImpl;
    let options: PluginOptions;
    let logger: MockLogger;
    let sshdAddr: string;
    const sshdPort = 22;
    let dataDir: string;

    mochaTmpdir.all("test-cloud-ansible");
    const sshd = dockerMocha.all(sshdContainerSpec);

    before("Ansible bootstrap & dir setup", async function () {
        this.timeout(60 * 1000);

        dataDir = path.join(process.cwd(), "pluginData");
        await installAnsible();
        await setupDir();
        await fs.ensureDir(dataDir);

        const sshdInfo = await sshd.container.inspect();
        sshdAddr = sshdInfo.NetworkSettings.IPAddress;

        await dockerExec(sshd.container, [
            `sh`, `-c`,
            `apk update` +
            ` && apk add python` +
            ` && mkdir -p /root/.ssh` +
            ` && echo '${sshPubKey}' > /root/.ssh/authorized_keys` +
            ` && chmod -R go-rwx /root/.ssh`
        ]);
    });

    beforeEach("Create plugin", () => {
        plugin = createAnsiblePlugin();
        logger = createMockLogger();
        options = {
            deployID: "abc123",
            log: logger.info,
            dataDir,
        };
    });

    async function simplePlaybookFile(
        host: AnsibleHost,
        playbookFile: string,
        groups: string | string[],
        vars: any) {

        const orig =
            <Group>
                <AnsiblePlaybook
                    playbookFile={playbookFile}
                    vars={vars}
                />
                <AnsibleGroup ansibleHost={host} groups={groups} />
            </Group>;
        await buildAndRun(orig);
    }

    async function simplePlaybookObj(
        host: AnsibleHost,
        playbookHosts: string,
        groups: string | string[],
        vars: any) {

        const orig =
            <Group>
                <AnsiblePlaybook
                    playbookPlays={[echoPlay(playbookHosts)]}
                    vars={vars}
                />
                <AnsibleGroup ansibleHost={host} groups={groups} />
            </Group>;
        await buildAndRun(orig);
    }

    async function simpleRole(
        host: AnsibleHost,
        role: string,
        vars: any) {

        const orig =
            <AnsibleRole ansibleHost={host} galaxy={role} vars={vars} />;
        await buildAndRun(orig);
    }

    async function buildAndRun(orig: AdaptElement) {
        const { dom } = await doBuild(orig, "<none>");
        await plugin.start(options);
        const obs = await plugin.observe(null, dom);
        const actions = plugin.analyze(null, dom, obs);
        should(actions.length).equal(1);
        should(actions[0].description).match(/Creating Ansible Playbook/);

        await act(actions);
        await plugin.finish();
    }

    it("Should run a local playbook [file]", async () => {
        await simplePlaybookFile(ansibleHostLocal, "echo_all.yaml", "somegroup", {});

        const output = await fs.readFile("test.output");
        should(output.toString()).equal("Test success\n");
    });

    it("Should run a local playbook [object]", async () => {
        await simplePlaybookObj(ansibleHostLocal, "all", "somegroup", {});

        const output = await fs.readFile("test.output");
        should(output.toString()).equal("Test success\n");
    });

    it("Should apply vars from props [file]", async () => {
        const vars = {
            test_val: "a different success"
        };
        await simplePlaybookFile(ansibleHostLocal, "echo_all.yaml", "somegroup", vars);

        const output = await fs.readFile("test.output");
        should(output.toString()).equal("Test a different success\n");
    });

    it("Should apply vars from props [object]", async () => {
        const vars = {
            test_val: "a different success"
        };
        await simplePlaybookObj(ansibleHostLocal, "all", "somegroup", vars);

        const output = await fs.readFile("test.output");
        should(output.toString()).equal("Test a different success\n");
    });

    it("Should run playbook via SSH with password", async () => {
        const vars = {
            test_val: "$(hostname)",
            output_file: "/tmp/ansible.test.out"
        };
        const host: AnsibleHost = {
            ansible_connection: "smart",
            ansible_host: sshdAddr,
            ansible_port: sshdPort,
            ansible_user: "root",
            ansible_ssh_pass: "root",
        };
        await simplePlaybookFile(host, "echo_all.yaml", "somegroup", vars);

        const output = await dockerExec(sshd.container, [
            "cat", "/tmp/ansible.test.out"
        ]);
        should(output.toString()).equal("Test sshd-test\n");
    });

    it("Should run playbook via SSH with keypair", async () => {
        const vars = {
            test_val: "$(hostname) keypair",
            output_file: "/tmp/ansible.test.out"
        };
        const host: AnsibleHost = {
            ansible_connection: "smart",
            ansible_host: sshdAddr,
            ansible_port: sshdPort,
            ansible_user: "root",
            ansible_ssh_private_key: sshPrivKey,
        };
        await simplePlaybookFile(host, "echo_all.yaml", "somegroup", vars);

        const output = await dockerExec(sshd.container, [
            "cat", "/tmp/ansible.test.out"
        ]);
        should(output.toString()).equal("Test sshd-test keypair\n");
    });

    it("Should fail with bad password", async () => {
        const vars = {
            test_val: "$(hostname)",
            output_file: "/tmp/ansible.test.out"
        };
        const host: AnsibleHost = {
            ansible_connection: "smart",
            ansible_host: sshdAddr,
            ansible_port: sshdPort,
            ansible_user: "notroot",
            ansible_ssh_pass: "badpassword",
        };

        await should(simplePlaybookFile(host, "echo_all.yaml", "somegroup", vars))
            .be.rejectedWith(/Error executing ansible-playbook/m);
    });

    it("Should reject a playbook file outside the project directory");

    it("Should match host with group name [file]", async () => {
        // tslint:disable-next-line:variable-name
        const output_file = "match_group.output";
        await simplePlaybookFile(ansibleHostLocal, "echo_group1.yaml", "group1", {
            output_file,
        });

        const output = (await fs.readFile(output_file)).toString();
        should(output).equal("Test success\n");
    });

    it("Should match host with group name [object]", async () => {
        // tslint:disable-next-line:variable-name
        const output_file = "match_group.output";
        await simplePlaybookObj(ansibleHostLocal, "group1", "group1", {
            output_file,
        });

        const output = (await fs.readFile(output_file)).toString();
        should(output).equal("Test success\n");
    });

    it("Should not match host with group name", async () => {
        // tslint:disable-next-line:variable-name
        const output_file = "no_match_group.output";
        await simplePlaybookFile(ansibleHostLocal, "echo_group1.yaml", "group2", {
            output_file,
        });

        should(await fs.pathExists(output_file)).be.False();
    });

    it("Should match host with hostname", async () => {
        // tslint:disable-next-line:variable-name
        const output_file = "match_host.output";
        await simplePlaybookFile(ansibleHostLocal, "echo_localhost.yaml", "group2", {
            output_file,
        });

        const output = (await fs.readFile(output_file)).toString();
        should(output).equal("Test success\n");
    });

    it("Should apply role from galaxy", async () => {
        let output = (await fs.readFile("/etc/motd")).toString();
        should(output).not.match(/This system is managed by Ansible/);

        await simpleRole(ansibleHostLocal, "adriagalin.motd", {});

        output = (await fs.readFile("/etc/motd")).toString();
        should(output).match(/This system is managed by Ansible/);
    });

    it("Should apply role from galaxy with vars", async () => {
        const msg = `
            This system is managed by Adapt!"
            This is a second line.
        `;
        const template = `{{ ag_motd_info }}`;
        const more = `- This is some more of the motd\n\n`;

        let output = (await fs.readFile("/etc/motd")).toString();
        should(output).not.match(/This system is managed by Adapt/);

        await simpleRole(ansibleHostLocal, "adriagalin.motd", {
            ag_motd_content: msg + template,
            ag_motd_info: more,
        });

        output = (await fs.readFile("/etc/motd")).toString();
        should(output).equal(msg + more);
    });

    it("Should throw error on invalid galaxy name", async () => {
        return should(simpleRole(ansibleHostLocal, "invaliduser.dontexist", {}))
            .be.rejectedWith(/invaliduser.dontexist was not found/);
    });
});
