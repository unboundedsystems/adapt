const defaults = require("../dist/src/local-registry-defaults");
const registry = require("../dist/src/local-registry");

async function main() {
    await registry.start(defaults.config, defaults.configPath);
}

main();
