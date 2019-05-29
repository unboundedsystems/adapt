import {
    describeLong,
    k8sutils,
    mochaTmpdir,
} from "@usys/testutils";
import { sleep } from "@usys/utils";
import execa from "execa";
import fs from "fs-extra";
import path from "path";
import { expect } from "../common/fancy";
import { mkInstance } from "../common/start-minikube";
import { getNewDeployID } from "../common/testlib";
import { curlOptions, projectsRoot, systemTestChain } from "./common";

const { deleteAll, getAll } = k8sutils;

// NOTE(mark): These tests use the same project directory to deploy multiple
// times, both to test that functionality and to reduce setup runtime (mostly
// from NPM).
describeLong("tshello system tests", function () {
    let kClient: k8sutils.KubeClient;
    let kDeployID: string | undefined;
    let dockerHost: string;

    this.timeout(6 * 60 * 1000);

    const copyDir = path.join(projectsRoot, "tshello");
    mochaTmpdir.all("adapt-cli-test-tshello", { copy: copyDir });

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
    .command(["run", "prod"])

    .it("Should deploy tshello to k8s", async ({ stdout, stderr }) => {
        expect(stderr).equals("");
        expect(stdout).contains("Validating project [completed]");
        expect(stdout).contains("Creating new project deployment [completed]");

        kDeployID = getNewDeployID(stdout);

        let pods: any;
        let i: number;
        for (i = 120; i > 0; i--) {
            pods = await getAll("pods", { client: kClient, deployID: kDeployID });
            expect(pods).to.have.length(1);
            expect(pods[0] && pods[0].status).to.be.an("object").and.not.null;

            // containerStatuses can take a moment to populate
            if (pods[0].status.containerStatuses) {
                expect(pods[0].status.containerStatuses).to.be.an("array").with.length(1);
                if ((pods[0].status.phase === "Running") &&
                    (pods[0].status.containerStatuses[0].ready)) {
                    break;
                }
            }
            await sleep(1000);
        }
        if (i <= 0) throw new Error(`Pods did not become ready`);

        const ret = await execa("curl", [
            ...curlOptions,
            `http://${dockerHost}:8080/`
        ]);
        expect(ret.stdout).equals("Hello World! via TypeScript");
    });
});
