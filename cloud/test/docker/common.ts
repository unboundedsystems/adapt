import execa from "execa";
import { adaptDockerDeployIDKey } from "../../src/docker";

export async function deleteAllContainers(deployID: string) {
    try {
        const ctrList = await execa.stdout("docker", ["ps", "-a", "-q",
            "--filter", `label=${adaptDockerDeployIDKey}=${deployID}`]);
        if (!ctrList) return;
        const ctrs = ctrList.split(/.\+/);
        if (ctrs.length > 0) await execa("docker", ["rm", "-f", ...ctrs]);
    } catch (err) {
        // tslint:disable-next-line: no-console
        console.log(`Error deleting containers (ignored):`, err);
    }
}
