import * as fs from "fs";
import * as path from "path";

export const pkgRootDir = findPkgRoot(__dirname);
export const pkgTestDir = path.join(pkgRootDir, "test");
export const pkgDistDir = path.join(pkgRootDir, "dist");

/**
 * Given a directory path in the execution directory (i.e. "dist"), return
 * the corresponding source directory.
 * @param dirname Runtime execution directory to translate into source
 *     directory. Typically just pass your local __dirname for the current
 *     file. Must be absolute path.
 */
export function sourceDir(dirname: string) {
    if (!path.isAbsolute(dirname)) {
        throw new Error(`'${dirname} is not an absolute path`);
    }
    return dirname.replace(RegExp(path.sep + "dist"), "");
}

function findPkgRoot(dirname: string) {
    dirname = path.resolve(dirname);
    do {
        const pkgJson = path.join(dirname, "package.json");
        if (fs.existsSync(pkgJson)) return dirname;

        const parent = path.dirname(dirname);
        if (parent === dirname) {
            throw new Error(`Unable to find package root directory`);
        }
        dirname = parent;
    } while (true);
}
