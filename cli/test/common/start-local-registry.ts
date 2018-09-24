import { localRegistryDefaults, mochaLocalRegistry } from "@usys/utils";

// Use the mocha-verdaccio test fixture. Starts verdaccio before any test
// starts
export const cliLocalRegistry = mochaLocalRegistry.all({
    publishList: localRegistryDefaults.defaultPublishList
});
