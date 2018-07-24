import * as verdaccio from "../testlib/mocha-verdaccio";

import { verdaccioConfig, verdaccioConfigPath } from "./local-registry-config";

// Use the mocha-verdaccio test fixture. Starts verdaccio before any test
// starts
verdaccio.all(verdaccioConfig, verdaccioConfigPath);
