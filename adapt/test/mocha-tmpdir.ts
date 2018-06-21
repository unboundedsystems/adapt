import * as fs from "fs";
import * as fse from "fs-extra";
import * as os from "os";
import * as path from "path";

export interface Options {
    copy?: string;
}

interface HasTmpdir {
    origdir: string;
    tmpdir: string;
}

type FixtureFunc = (callback: (done: MochaDone) => PromiseLike<any> | void) => void;

function tmpDirFixture(beforeFn: FixtureFunc, afterFn: FixtureFunc,
                       basename: string, opts?: Options) {
    beforeFn(function createTmpDir(this: any, done: (err?: Error) => void) {
        // tslint:disable-next-line:no-this-assignment
        const ctx: HasTmpdir = this;

        ctx.origdir = process.cwd();
        const base = path.join(os.tmpdir(), basename);
        ctx.tmpdir = fs.mkdtempSync(base + "-");
        process.chdir(ctx.tmpdir);
        if (opts && opts.copy) {
            fse.copy(opts.copy, ctx.tmpdir, done);
        } else {
            done();
        }
    });

    afterFn(function cleanupTmpDir(this: any, done: (err?: Error) => void) {
        // tslint:disable-next-line:no-this-assignment
        const ctx: HasTmpdir = this;

        process.chdir(ctx.origdir);
        if (!ctx.tmpdir) {
            done(new Error("mocha-tmpdir: can't find tmpdir to clean up"));
        } else if (process.env.KEEP_TMPDIR) {
            // tslint:disable-next-line:no-console
            console.log(`KEEP_TMPDIR: Not deleting tmpdir ${ctx.tmpdir}`);
            done();
        } else {
            fse.remove(ctx.tmpdir, done);
        }
    });
}

export function all(basename: string, opts?: Options) {
    tmpDirFixture(before, after, basename, opts);
}
export function each(basename: string, opts?: Options) {
    tmpDirFixture(beforeEach, afterEach, basename, opts);
}

export function getTmpdir(context: Mocha.ISuiteCallbackContext): string {
    return (context as any as HasTmpdir).tmpdir;
}

export function getOrigdir(context: Mocha.ISuiteCallbackContext): string {
    return (context as any as HasTmpdir).origdir;
}
