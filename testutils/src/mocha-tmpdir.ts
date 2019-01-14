import callsites = require("callsites");
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

export interface Options {
    chmod?: number;
    cleanupProcessListeners?: boolean;
    cleanupRequireCache?: boolean;
    copy?: string;
}

const defaultOptions = {
    chmod: 0x755,
    cleanupProcessListeners: true,
    cleanupRequireCache: true,
    copy: undefined,
};

type FixtureFunc = (callback: (done: MochaDone) => PromiseLike<any> | void) => void;

type Listener = (...args: any[]) => void;
interface DirInfo {
    listeners: Map<string | symbol, Listener[]>;
}
const activeDirs = new Map<string, DirInfo>();

function initDirInfo(dirName: string) {
    activeDirs.set(dirName, {
        listeners: new Map(),
    });
}

function cleanup(dirName: string, opts: Options) {
    const info = activeDirs.get(dirName);
    if (!info) throw new Error(`Cleaning up mocha-tmpdir '${dirName}' but no info`);

    if (opts.cleanupProcessListeners) {
        for (const [evName, listeners] of info.listeners) {
            for (const listener of listeners) {
                process.removeListener(evName, listener);
            }
        }
    }
    if (opts.cleanupRequireCache) {
        for (const f of Object.keys(require.cache)) {
            if (f.startsWith(dirName)) delete require.cache[f];
        }
    }

    activeDirs.delete(dirName);
}

function tmpDirFixture(beforeFn: FixtureFunc, afterFn: FixtureFunc,
                       basename: string, options: Options = {}) {
    const opts = { ...defaultOptions, ...options };
    let origdir: string | undefined;
    let tmpdir: string | undefined;

    beforeFn(async function createTmpDir() {
        if (origdir || tmpdir) throw new Error(`'before' called twice without calling 'after'`);
        origdir = process.cwd();
        const base = path.join(os.tmpdir(), basename);
        tmpdir = await fs.mkdtemp(base + "-");
        initDirInfo(tmpdir);
        await fs.chmod(tmpdir, opts.chmod);
        process.chdir(tmpdir);
        if (opts.copy) await fs.copy(opts.copy, tmpdir);
    });

    afterFn(async function cleanupTmpDir(this: any) {
        this.timeout(30 * 1000);
        if (!origdir || !tmpdir) return;
        process.chdir(origdir);
        if (process.env.KEEP_TMPDIR) {
            // tslint:disable-next-line:no-console
            console.log(`KEEP_TMPDIR: Not deleting tmpdir ${tmpdir}`);
        } else {
            await fs.remove(tmpdir);
        }
        cleanup(tmpdir, opts);
        origdir = undefined;
        tmpdir = undefined;
    });
}

export function all(basename: string, opts?: Options) {
    tmpDirFixture(before, after, basename, opts);
}
export function each(basename: string, opts?: Options) {
    tmpDirFixture(beforeEach, afterEach, basename, opts);
}

function trackListener(event: string | symbol, dirName: string, listener: Listener) {
    const info = activeDirs.get(dirName);
    if (!info) throw new Error(`Trying to track listener for tmpdir '${dirName}' that has no info`);

    let listeners = info.listeners.get(event);
    if (!listeners) {
        listeners = [];
        info.listeners.set(event, listeners);
    }
    listeners.push(listener);
}

function findTmpdirOnStack() {
    const dirs = Array.from(activeDirs.keys());
    if (dirs.length === 0) return undefined;

    const stack = callsites();
    for (const frame of stack) {
        const fname = frame.getFileName();
        if (!fname) continue;
        for (const d of dirs) {
            if (fname.startsWith(d)) return d;
        }
    }
    return undefined;
}

process.on("newListener", (event, listener) => {
    const tmpdir = findTmpdirOnStack();
    if (tmpdir) trackListener(event, tmpdir, listener);
});
