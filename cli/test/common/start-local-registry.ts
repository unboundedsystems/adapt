import { localRegistryDefaults, mochaLocalRegistry } from "@usys/utils";

// Use the mocha-verdaccio test fixture. Starts verdaccio before any test
// starts
mochaLocalRegistry.all(localRegistryDefaults.config, localRegistryDefaults.configPath);
