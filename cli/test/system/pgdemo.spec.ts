import {
    describeLong,
    k8sutils,
    mochaTmpdir,
} from "@usys/testutils";
import { waitForNoThrow } from "@usys/utils";
import execa from "execa";
import fs from "fs-extra";
import path from "path";
import { expect } from "../common/fancy";
import { mkInstance } from "../common/start-minikube";
import { getNewDeployID } from "../common/testlib";
import { projectsRoot, systemTestChain } from "./common";

const { deleteAll, getAll } = k8sutils;

function isPodReady(pod: any) {
    expect(pod && pod.status).to.be.an("object").and.not.null;

    // containerStatuses can take a moment to populate
    if (!pod.status.containerStatuses) return false;
    expect(pod.status.containerStatuses).to.be.an("array").with.length(1);
    return ((pod.status.phase === "Running") &&
        pod.status.containerStatuses[0].ready);
}

describeLong("pgdemo system tests", function () {
    let kClient: k8sutils.KubeClient;
    let kDeployID: string | undefined;
    let dockerHost: string;

    this.timeout(6 * 60 * 1000);

    const copyDir = path.join(projectsRoot, "pgdemo");
    mochaTmpdir.all("adapt-cli-test-pgdemo", { copy: copyDir });

    before(async function () {
        this.timeout(60 * 1000 + mkInstance.setupTimeoutMs);
        const results = await Promise.all([
            mkInstance.client,
            mkInstance.info,
            fs.outputJson("kubeconfig.json", await mkInstance.kubeconfig),
        ]);

        kClient = results[0];
        const ctrInfo = await results[1].container.inspect();
        dockerHost = ctrInfo.Name;
        if (dockerHost.startsWith("/")) dockerHost = dockerHost.slice(1);
        if (!dockerHost) {
            // tslint:disable-next-line:no-console
            console.log(`Minikube ctrInfo`, ctrInfo);
            throw new Error(`Error getting minikube endpoint`);
        }
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
    });

    systemTestChain
    .delayedenv(() => ({ DOCKER_HOST: dockerHost }))
    .command(["deploy:create", "--init", "k8s"])

    .it("Should deploy pgdemo to k8s", async ({ stdout, stderr }) => {
        expect(stderr).equals("");
        expect(stdout).contains("Validating project [completed]");
        expect(stdout).contains("Creating new project deployment [completed]");

        kDeployID = getNewDeployID(stdout);

        let pods: any;
        await waitForNoThrow(120, 1, async () => {
            pods = await getAll("pods", { client: kClient, deployID: kDeployID });
            expect(pods).to.have.length(2);
            if (!isPodReady(pods[0]) || !isPodReady(pods[1])) throw new Error(`Pods not ready`);
        });

        await waitForNoThrow(5, 5, async () => {
            const resp = await execa.stdout("curl", [
                "--connect-timeout", "5",
                `http://${dockerHost}:8080/`
            ]);
            expect(resp).equals(`Hello World! The first movie is "The Incredibles"!`);
        });
    });
});
