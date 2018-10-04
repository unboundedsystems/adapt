import { getEnvAsBoolean } from "@usys/utils";
import * as heapdumpType from "heapdump";
import { padStart } from "lodash";
import * as moment from "moment";
import * as numeral from "numeral";
import * as path from "path";

let hd: typeof heapdumpType | undefined;
// tslint:disable-next-line:no-var-requires
if (getEnvAsBoolean("ADAPT_TEST_HEAPDUMP")) hd = require("heapdump");

function format(cur: number, prev?: number) {
    if (prev === undefined) {
        return numeral(cur).format("0,0");
    }
    return numeral(cur - prev).format("+0,0");
}

/**
 * Can be used in mocha unit tests to test for memory leaks.
 */
export function heapUsed() {
    if (!hd) { return { n: 0, s: "" }; }

    try {
        global.gc();
    } catch (e) {
        // tslint:disable-next-line:no-console
        console.log(`For ADAPT_TEST_HEAPDUMP to work properly, node must be run with --expose-gc`);
        process.exit(1);
    }
    const used = process.memoryUsage().heapUsed;
    return {
        n: used,
        s: format(used),
    };
}

type When = "none" | "each" | "all";

export interface Options {
    eachError?: number;
    eachWarning?: number;
    modName?: string;
    print?: When;
    snapshot?: When;
    snapshotDir?: string;
}

const defaults = {
    eachError: undefined,
    eachWarning: undefined,
    modName: "mocha",
    snapshotDir: undefined,
    snapshot: "none" as When,
    print: "each" as When,
};

function doNow(when: When, forAfterEach: boolean) {
    switch (when) {
        case "none": return false;
        // each implies all
        case "each": return true;
        case "all": return !forAfterEach;
    }
}

export function use(options: Options = {}) {
    if (!hd) return;

    const opts = { ...defaults, ...options };
    const snapshotDir = opts.snapshotDir || process.cwd();
    const runTimestamp = moment().format("YYYYMMDD-HHmm-ss");
    let prevUsed = 0;
    let count = 0;

    function snapshot(forAfterEach: boolean, tag?: string) {
        const current = heapUsed();
        const delta = current.n - prevUsed;
        const sDelta = prevUsed ? format(current.n, prevUsed) : "0";
        tag = tag ? ` (${tag})` : "";

        const seq = padStart(count.toString(10), 5, "0");
        const fname = path.join(snapshotDir,
            `heap-${opts.modName}-${runTimestamp}-${seq}.heapsnapshot`);

        const doSnap = doNow(opts.snapshot, forAfterEach);
        if (hd && doSnap) {
            hd.writeSnapshot(fname);
            count++;
        }

        if (doNow(opts.print, forAfterEach)) {
            let msg = `HEAPDUMP[${opts.modName}]: heap used: ` +
                `${current.s} bytes [delta ${sDelta}]${tag}`;
            if (doSnap) msg += ` snap ${seq}`;
            // tslint:disable-next-line:no-console
            console.log(msg);
        }

        // Do per-test warnings/errors
        if (forAfterEach && prevUsed) {
            if (opts.eachError && delta > opts.eachError) {
                const msg = `HEAPDUMP ERROR[${opts.modName}]: ` +
                    `Test leaked ${sDelta} bytes of memory`;
                // tslint:disable-next-line:no-console
                console.log(msg);
                throw new Error(msg);
            }
            if (opts.eachWarning && delta > opts.eachWarning) {
                const msg = `HEAPDUMP WARNING[${opts.modName}]: ` +
                    `Test leaked ${sDelta} bytes of memory`;
                // tslint:disable-next-line:no-console
                console.log(msg);
            }
        }

        prevUsed = current.n;

        return current;
    }

    const startingHeap = snapshot(false, "start");

    afterEach("heapdump", function () {
        this.timeout(60 * 1000);
        snapshot(true);
    });

    after("Final heapdump", function () {
        this.timeout(60 * 1000);
        const finalHeap = snapshot(false, "final");

        const diff = format(finalHeap.n, startingHeap.n);
        // tslint:disable-next-line:no-console
        console.log(`HEAPDUMP[${opts.modName}]: Final heap (${finalHeap.s}) - ` +
            `start (${startingHeap.s}) = ${diff}`);
    });
}

export default use;
