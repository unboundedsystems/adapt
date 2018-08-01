export * from "./paths";

import * as localRegistry from "./local-registry";
import * as localRegistryDefaults from "./local-registry-defaults";
import * as mochaLocalRegistry from "./mocha-local-registry";
import * as mochaTmpdir from "./mocha-tmpdir";
import * as npm from "./npm";
import { sleep } from "./sleep";

export {
    localRegistry,
    localRegistryDefaults,
    mochaLocalRegistry,
    mochaTmpdir,
    npm,
    sleep
};
