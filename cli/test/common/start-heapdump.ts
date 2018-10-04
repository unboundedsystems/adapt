import { heapdumpMocha } from "@usys/testutils";

heapdumpMocha.use({
    modName: "cli",
    snapshotDir: "/tmp",
    eachWarning: 2 * 1000000,
    print: "all",
});
