import { getEnvAsBoolean } from "@usys/utils";

const runLongTests = getEnvAsBoolean("ADAPT_RUN_LONG_TESTS");

export function describeLong(title: string, fn?: (this: Mocha.Suite) => void) {
    if (fn === undefined) {
        return describe(title);
    } else {
        return runLongTests ? describe(title, fn) : xdescribe(title, fn);
    }
}
