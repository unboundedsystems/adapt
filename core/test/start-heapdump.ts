import { heapdumpMocha } from "@adpt/testutils";

heapdumpMocha.use({
    modName: "core",
    snapshotDir: "/tmp",
    eachWarning: 2 * 1000000,
    print: "all",
});
