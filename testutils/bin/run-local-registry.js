const defaults = require("../dist/src/local-registry-defaults");
const registry = require("../dist/src/local-registry");
const utils = require("@adpt/utils");

async function main() {
    const storage = await utils.mkdtmp("adapt-local-registry");
    await registry.start({
        ...defaults.config,
        storage,
    }, defaults.configPath);
}

main();
