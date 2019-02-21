import { filePathToUrl } from "@usys/utils";
import path from "path";
import { clitest } from "../common/fancy";
import { pkgRootDir } from "../common/paths";
import { cliLocalRegistry } from "../common/start-local-registry";

export const systemTestChain =
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
            ADAPT_NPM_REGISTRY: cliLocalRegistry.yarnProxyOpts.registry,
            ADAPT_SERVER_URL: filePathToUrl("local_server"),
        };
    });

export const projectsRoot = path.join(pkgRootDir, "test_projects");

export const curlOptions = [
    "--silent", "--show-error", // No progress, just errors
    "--max-time", "1",
];
