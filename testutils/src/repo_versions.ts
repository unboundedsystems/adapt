import { repoDirs } from "@adpt/utils";
import fs from "fs-extra";
import path from "path";

export type RepoVersions = typeof repoDirs;
// tslint:disable-next-line:no-object-literal-type-assertion
export const repoVersions: RepoVersions = {} as RepoVersions;

const dirNames: (keyof RepoVersions)[] = Object.keys(repoDirs) as any[];

for (const dir of dirNames) {
    const pkgJ = fs.readJsonSync(path.join(repoDirs[dir], "package.json"));
    repoVersions[dir] = pkgJ.version;
}
