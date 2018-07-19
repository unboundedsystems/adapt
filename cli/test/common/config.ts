import * as path from "path";
import { verdaccioDir } from "./paths";

export const localRegistryPort = 4873;
export const localRegistryUrl = `http://127.0.0.1:${localRegistryPort}`;

export const npmLocalProxyOpts = {
    registry: localRegistryUrl,
    userconfig: path.join(verdaccioDir, "npmrc_test"),
};
