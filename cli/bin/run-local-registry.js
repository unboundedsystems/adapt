const config = require("../dist/test/common/local-registry-config");
const verdaccio = require("../dist/test/testlib/verdaccio");

async function main() {
    await verdaccio.start(config.verdaccioConfig,
                          config.verdaccioConfigPath);
}

main();
