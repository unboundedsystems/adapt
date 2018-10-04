import { heapdumpMocha } from "@usys/testutils";

heapdumpMocha.use({
    modName: "adapt",
    snapshotDir: "/tmp",
    eachWarning: 2 * 1000000,
    print: "all",
});
