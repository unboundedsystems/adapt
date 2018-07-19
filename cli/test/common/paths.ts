import * as path from "path";
import { pkgRootDir } from "../testlib/paths";

export * from "../testlib/paths";

// Project directories for our sibling modules
export const adaptDir = path.resolve(path.join(pkgRootDir, "..", "adapt"));
export const cliDir   = path.resolve(path.join(pkgRootDir, "..", "cli"));
export const cloudDir = path.resolve(path.join(pkgRootDir, "..", "cloud"));

// Where we store all verdaccio config and also data storage
export const verdaccioDir = path.resolve(path.join(pkgRootDir, "..", "verdaccio"));
