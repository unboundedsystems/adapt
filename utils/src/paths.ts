import * as fs from "fs";
import * as path from "path";
import { URL } from "url";

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

/**
 * Given a directory path in the execution directory (i.e. "dist"), return
 * a set of directory paths for the enclosing NPM package.
 * @param dirname Runtime execution directory within an NPM package.
 *     Typically just pass your local __dirname for the current
 *     file.
 */
export function findPackageDirs(dirname: string) {
    let root: string | null = null;
    let repoRoot: string | null = null;

    dirname = path.resolve(dirname);
    do {
        if (root == null) {
            const pkgJson = path.join(dirname, "package.json");
            if (fs.existsSync(pkgJson)) root = dirname;
        }
        const dotGit = path.join(dirname, ".git");
        if (fs.existsSync(dotGit)) {
            repoRoot = dirname;
            break;
        }

        const parent = path.dirname(dirname);
        if (parent === dirname) {
            break;
        }
        dirname = parent;
    } while (true);

    if (root == null) {
        throw new Error(`Error finding package directories`);
    }

    return {
        root,
        repoRoot: repoRoot || "/dev/null", // Not supported outside of a git repo
        test: path.join(root, "test"),
        dist: path.join(root, "dist"),
    };
}

export const utilsDirs = findPackageDirs(__dirname);
export const repoRootDir = utilsDirs.repoRoot;
export const repoDirs = {
    "adapt": path.join(repoRootDir, "adapt"),
    "cli": path.join(repoRootDir, "cli"),
    "cloud": path.join(repoRootDir, "cloud"),
    "collections-ts": path.join(repoRootDir, "collections-ts"),
    "dom-parser": path.join(repoRootDir, "dom-parser"),
    "testutils": path.join(repoRootDir, "testutils"),
    "utils": path.join(repoRootDir, "utils"),
    "verdaccio": path.join(repoRootDir, "verdaccio"),
};

/**
 * Given a local file path, convert it to a file:// URL.
 * @param pathString Local filesystem path. If not absolute, path.resolve
 *     will be used to convert it to absolute first.
 */
export function filePathToUrl(pathString: string) {
    pathString = path.resolve(pathString);
    const localUrl = new URL(`file:///${pathString}`);
    return localUrl.href;
}
