import { k8sutils, minikubeMocha } from "@usys/testutils";
import { filePathToUrl, mochaTmpdir, sleep } from "@usys/utils";
import * as fs from "fs-extra";
import * as path from "path";
import { clitest, expect } from "../common/fancy";
import { pkgRootDir } from "../common/paths";
import { cliLocalRegistry } from "../common/start-local-registry";

const { deleteAll, getAll } = k8sutils;

const ncTestChain =
    clitest
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

describe("Nodecellar system tests", function () {
    let client: k8sutils.KubeClient;
    let deployID: string | undefined;

    this.timeout(2 * 60 * 1000);

    const minikube = minikubeMocha.all();

    const copyDir = path.join(projectsRoot, "nodecellar");
    mochaTmpdir.all("adapt-cli-test-nodecellar", { copy: copyDir });

    before(async () => {
        client = await minikube.client;
        await fs.outputJson("kubeconfig.json", minikube.kubeconfig);
    });

    afterEach(async function () {
        this.timeout(2 * 1000);
        if (deployID) {
            await deleteAll("pods", { client, deployID });
            await deleteAll("services", { client, deployID });
            deployID = undefined;
        }
    });

    ncTestChain
    .command(["deploy:create", "--init", "k8s"])

    .it("Should build k8s style", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");

        const matches = ctx.stdout.match(newDeployRegex);
        expect(matches).to.be.an("array").with.length(2);
        if (matches && matches[1]) deployID = matches[1];
        expect(deployID).to.be.a("string").with.length.greaterThan(0);

        let pods: any;
        for (let i = 0; i < 120; i++) {
            pods = await getAll("pods", { client, deployID });
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
});
