import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";

export interface Options {
    copy?: string;
    chmod?: number;
}

const defaultOptions = {
    copy: undefined,
    chmod: 0x755,
};

type FixtureFunc = (callback: (done: MochaDone) => PromiseLike<any> | void) => void;

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
        await fs.chmod(tmpdir, opts.chmod);
        process.chdir(tmpdir);
        if (opts.copy) await fs.copy(opts.copy, tmpdir);
    });

    afterFn(async function cleanupTmpDir() {
        if (!origdir || !tmpdir) return;
        process.chdir(origdir);
        if (process.env.KEEP_TMPDIR) {
            // tslint:disable-next-line:no-console
            console.log(`KEEP_TMPDIR: Not deleting tmpdir ${tmpdir}`);
        } else {
            await fs.remove(tmpdir);
        }
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
