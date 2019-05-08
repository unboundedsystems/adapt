import { mochaTmpdir } from "@usys/testutils";
import { filePathToUrl } from "@usys/utils";
import fs from "fs-extra";
import path from "path";
import { clitest } from "../common/fancy";
import { pkgRootDir } from "../common/paths";
import { cliLocalRegistry } from "../common/start-local-registry";

export const systemTestChain =
    clitest
    .onerror((ctx) => {
        // tslint:disable:no-console
        console.log(`\n---------------------------------\nError encountered. Dumping stdout.`);
        console.log(ctx.stdout);
        console.log(`\n---------------------------------\nError encountered. Dumping stderr.`);
        console.log(ctx.stderr);
        // tslint:enable:no-console
    })
    .stub(process.stdout, "isTTY", false) // Turn off progress, etc
    .stdout()
    .stderr()
    .delayedenv(() => {
        return {
            ADAPT_NPM_REGISTRY: cliLocalRegistry.yarnProxyOpts.registry,
            ADAPT_SERVER_URL: filePathToUrl("local_server"),
        };
    });

export const projectsRoot = path.join(pkgRootDir, "test_projects");
export const appSubdir = "app";

async function appSetupCommon(appName: string) {
    const appDir = path.join(projectsRoot, appName);
    await fs.copy(appDir, appSubdir);
    process.chdir(appSubdir);
}

export const systemAppSetup = {
    all(appName: string) {
        mochaTmpdir.all("adapt-sys-test-" + appName);
        before("systemAppSetup", async () => {
            await appSetupCommon(appName);
        });
    },
    each(appName: string) {
        mochaTmpdir.each("adapt-sys-test-" + appName);
        beforeEach("systemAppSetup", async () => {
            await appSetupCommon(appName);
        });
    }
};

export const curlOptions = [
    "--silent", "--show-error", // No progress, just errors
    "--max-time", "1",
];
