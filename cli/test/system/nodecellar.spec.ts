import {
    awsutils,
    describeLong,
    dockerutils,
    installAnsible,
    k8sutils,
    minikubeMocha,
    mochaTmpdir,
} from "@usys/testutils";
import { filePathToUrl, sleep } from "@usys/utils";
import Docker = require("dockerode");
import execa from "execa";
import * as fs from "fs-extra";
import * as path from "path";
import { clitest, expect } from "../common/fancy";
import { findDeploymentDir, findHistoryDirs } from "../common/local_server";
import { pkgRootDir } from "../common/paths";
import { cliLocalRegistry } from "../common/start-local-registry";

const { deleteAll, getAll } = k8sutils;
const {
    checkStackStatus,
    deleteAllStacks,
    getAwsClient,
    waitForStacks,
} = awsutils;
const { deleteContainer } = dockerutils;

// FIXME(mark): The following line needs to be a require because importing
// the types from adapt currently causes a compile error due to adapt
// not having strictFunctionTypes=true
// FIXME(mark): The following line does a deep submodule import to avoid
// triggering the AWS plugin to register. The modules should probably be
// reorganized to better allow this import.
// tslint:disable-next-line:no-submodule-imports no-var-requires
const awsCredentials = require("@usys/cloud/dist/src/aws/credentials");
const { loadAwsCreds } = awsCredentials;

const ncTestChain =
    clitest
    .onerror((ctx) => {
        // tslint:disable-next-line:no-console
        console.log(`Error encountered. Dumping stdout.`);
        // tslint:disable-next-line:no-console
        console.log(ctx.stdout);
    })
    .stub(process.stdout, "isTTY", false) // Turn off progress, etc
    .stdout()
    .stderr()
    .delayedenv(() => {
        return {
            ADAPT_NPM_REGISTRY: cliLocalRegistry.npmProxyOpts.registry,
            ADAPT_SERVER_URL: filePathToUrl("local_server"),
        };
    });

const projectsRoot = path.join(pkgRootDir, "test_projects");

const newDeployRegex = /Deployment created successfully. DeployID is: (.*)$/m;

// NOTE(mark): These tests use the same project directory to deploy multiple
// times, both to test that functionality and to reduce setup runtime (mostly
// from NPM).
describeLong("Nodecellar system tests", function () {
    const docker = new Docker({ socketPath: "/var/run/docker.sock" });
    let kClient: k8sutils.KubeClient;
    let aClient: AWS.CloudFormation;
    let kDeployID: string | undefined;
    let aDeployID: string | undefined;

    this.timeout(6 * 60 * 1000);

    const minikube = minikubeMocha.all();

    const copyDir = path.join(projectsRoot, "nodecellar");
    mochaTmpdir.all("adapt-cli-test-nodecellar", { copy: copyDir });

    before(async function () {
        this.timeout(60 * 1000);
        const results = await Promise.all([
            minikube.client,
            loadAwsCreds(),
            // Bootstrap our CLI system with ansible
            installAnsible(),
            deleteContainer(docker, "mongo"),
            deleteContainer(docker, "nodecellar"),
            fs.outputJson("kubeconfig.json", minikube.kubeconfig),
        ]);

        kClient = results[0];
        aClient = getAwsClient(results[1]);
    });

    after(async function () {
        this.timeout(30 * 1000);
        await Promise.all([
            deleteContainer(docker, "mongo"),
            deleteContainer(docker, "nodecellar"),
        ]);
    });

    afterEach(async function () {
        this.timeout(65 * 1000);
        if (kDeployID && kClient) {
            await Promise.all([
                deleteAll("pods", { client: kClient, deployID: kDeployID }),
                deleteAll("services", { client: kClient, deployID: kDeployID }),
            ]);
            kDeployID = undefined;
        }
        if (aDeployID && aClient) {
            await deleteAllStacks(aClient, aDeployID, 60 * 1000, false);
            aDeployID = undefined;
        }
    });

    ncTestChain
    .command(["deploy:create", "--init", "dev"])

    .it("Should deploy local style", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");

        const matches = ctx.stdout.match(newDeployRegex);
        expect(matches).to.be.an("array").with.length(2);
        if (matches && matches[1]) kDeployID = matches[1];
        expect(kDeployID).to.be.a("string").with.length.greaterThan(0);

        const nc = docker.getContainer("nodecellar");
        const ncIP = (await nc.inspect()).NetworkSettings.IPAddress;

        let ret = await execa("curl", [ `http://${ncIP}:8080/` ]);
        expect(ret.stdout).contains("<title>Node Cellar</title>");

        ret = await execa("curl", [ `http://${ncIP}:8080/wines` ]);
        expect(ret.stdout).contains("Though dense and chewy, this wine does not overpower");
    });

    ncTestChain
    .command(["deploy:create", "--init", "k8s"])

    .it("Should deploy k8s style", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");

        const matches = ctx.stdout.match(newDeployRegex);
        expect(matches).to.be.an("array").with.length(2);
        if (matches && matches[1]) kDeployID = matches[1];
        expect(kDeployID).to.be.a("string").with.length.greaterThan(0);

        let pods: any;
        for (let i = 0; i < 120; i++) {
            pods = await getAll("pods", { client: kClient, deployID: kDeployID });
            expect(pods).to.have.length(1);
            expect(pods[0] && pods[0].status).to.be.an("object").and.not.null;

            // containerStatuses can take a moment to populate
            if (pods[0].status.containerStatuses == null) continue;

            expect(pods[0].status.containerStatuses).to.be.an("array").with.length(2);
            if ((pods[0].status.phase === "Running") &&
                (pods[0].status.containerStatuses[0].ready) &&
                (pods[0].status.containerStatuses[1].ready)) {
                break;
            }
            await sleep(1000);
        }
        expect(pods[0].spec.containers).to.have.length(2);

        // TODO: Should be able to curl the web interface and get HTML
    });

    function getStackName(stateStore: any): string {
        if (typeof stateStore !== "object") throw new Error(`Bad state`);
        for (const ns of Object.keys(stateStore)) {
            const state = stateStore[ns];
            const ids = state.adaptResourceIds;
            if (!ids) continue;
            const sn = ids.StackName;
            if (!sn) continue;
            const id = sn.currentId;
            if (id) return id;
        }
        throw new Error(`Unable to find StackName in state store`);
    }

    ncTestChain
    .command(["deploy:create", "--init", "aws"])

    .it("Should deploy AWS style", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");

        const matches = ctx.stdout.match(newDeployRegex);
        expect(matches).to.be.an("array").with.length(2);
        if (matches && matches[1]) aDeployID = matches[1];
        else throw new Error(`No DeployID found in CLI output`);
        expect(aDeployID).to.be.a("string").with.length.greaterThan(0);

        // FIXME(mark): I need the generated StackName here to check if
        // things actually deployed, but we don't have status working yet,
        // so rummage around in the deployment history to get it. Yuck.
        const deployDir = findDeploymentDir(aDeployID);
        const historyDirs = await findHistoryDirs(deployDir);
        expect(historyDirs).to.have.length(2);
        const store = await fs.readJson(path.join(historyDirs[0], "adapt_state.json"));
        const stackName = getStackName(store);

        const stacks = await waitForStacks(aClient, aDeployID, [stackName],
            {timeoutMs: 4 * 60 * 1000});
        expect(stacks).to.have.length(1, "wrong number of stacks");
        await checkStackStatus(stacks[0], "CREATE_COMPLETE", true, aClient);

        // TODO: Should be able to curl the web interface and get HTML
    });
});
