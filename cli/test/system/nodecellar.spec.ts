import { k8sutils, minikube } from "@usys/testutils";
import { filePathToUrl, localRegistryDefaults, mochaTmpdir, sleep } from "@usys/utils";
import * as fs from "fs-extra";
import * as path from "path";
import { clitest, expect } from "../common/fancy";
import { pkgRootDir } from "../common/paths";

const localRegistryUrl = localRegistryDefaults.localRegistryUrl;

const { deleteAllPods, getK8sConfig, getPods } = k8sutils;
const { startTestMinikube, stopTestMinikube } = minikube;

const ncTestChain =
    clitest
    .stub(process.stdout, "isTTY", false) // Turn off progress, etc
    .stdout()
    .stderr()
    .delayedenv(() => {
        return {
            ADAPT_NPM_REGISTRY: localRegistryUrl,
            ADAPT_SERVER_URL: filePathToUrl("local_server"),
        };
    });

const projectsRoot = path.join(pkgRootDir, "test_projects");

describe("Nodecellar system tests", function () {
    this.timeout(60 * 1000);
    let kubeconfig: object;
    let k8sConfig: object;
    let minikubeInfo: minikube.MinikubeInfo;

    const copyDir = path.join(projectsRoot, "nodecellar");
    mochaTmpdir.all("adapt-cli-test-nodecellar", { copy: copyDir });

    before(async function () {
        this.timeout(20 * 1000);
        minikubeInfo = await startTestMinikube();
        kubeconfig = minikubeInfo.kubeconfig;
        await fs.outputJson("kubeconfig.json", kubeconfig);
        k8sConfig = getK8sConfig(kubeconfig);
    });

    after(async () => {
        if (minikubeInfo != null) {
            await stopTestMinikube(minikubeInfo);
        }
    });

    afterEach(async function () {
        this.timeout(2 * 1000);
        await deleteAllPods(k8sConfig);
    });

    ncTestChain
    .command(["deploy:create", "--init", "k8s"])

    .it("Should build k8s style", async (ctx) => {
        expect(ctx.stderr).equals("");
        expect(ctx.stdout).contains("Validating project [completed]");
        expect(ctx.stdout).contains("Creating new project deployment [completed]");

        let pods: any;
        for (let i = 0; i < 120; i++) {
            pods = await getPods(k8sConfig);
            expect(pods).to.have.length(1);
            expect(pods[0].status.containerStatuses).to.have.length(2);
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
