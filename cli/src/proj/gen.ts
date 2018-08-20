import { satisfies, validRange } from "semver";
import { Project } from "./project";

export interface Gen {
    name: string;
    dependencies: DependencyInfo;
    match(project: Project): MatchInfo;
    //update(project: Project, uType: UpdateType): void;
}
export type UpdateType = "minimal" | "preferred";

export interface DependencyInfo {
    [pkgName: string]: Dependency;
}

export interface Dependency {
    allowed: RangeString;
    preferred: RangeString;
}

export type RangeString = string;
export type VersionString = string;

export interface MatchInfo {
    matches: boolean;
    ok: UpdateInfo[];
    required: UpdateInfo[];
}
export interface UpdateInfo {
    name: string;
    message: string;
}

export interface GenMatch {
    gen: Gen;
    matchInfo: MatchInfo;
}

export function checkDependencies(deps: DependencyInfo, proj: Project): MatchInfo {
    const ok: UpdateInfo[] = [];
    const required: UpdateInfo[] = [];

    for (const pkg of Object.keys(deps)) {
        const hasVer = proj.getLockedVersion(pkg);
        if (hasVer == null) {
            required.push({
                name: pkg,
                message: `Package '${pkg}' is not installed`,
            });
            continue;
        }

        const dep = deps[pkg];
        if (satisfies(hasVer, dep.allowed)) {
            ok.push({
                name: pkg,
                message: `Package '${pkg}': installed version ${hasVer} ok`
            });
            continue;
        }

        required.push({
            name: pkg,
            message: `Package '${pkg}' version '${hasVer}' does not meet ` +
                `required version range '${dep.allowed}'`,
        });
    }
    return { ok, required, matches: required.length === 0 };
}

export function validateGenList(list: Gen[]) {
    if (list.length === 0) throw new Error(`Gen list cannot be empty`);

    for (const g of list) {
        for (const pkgName of Object.keys(g.dependencies)) {
            const dep = g.dependencies[pkgName];
            if (!validRange(dep.allowed)) {
                throw new Error(`Invalid semver allowed range string ` +
                                `'${dep.allowed}' for package '${pkgName}' ` +
                                `in '${g.name}'`);
            }

            if (!validRange(dep.preferred)) {
                throw new Error(`Invalid semver preferred range string ` +
                                `'${dep.preferred}' for package '${pkgName}' ` +
                                `in '${g.name}'`);
            }
        }
    }
}

export function matchDeps(this: Gen, proj: Project) {
    return checkDependencies(this.dependencies, proj);
}

export function _getGen(proj: Project, list: Gen[]): GenMatch {
    let gen: Gen | undefined;
    let matchInfo: MatchInfo | undefined;

    for (gen of list) {
        matchInfo = gen.match(proj);
        if (matchInfo.matches) return { gen, matchInfo };
    }
    if (!gen || ! matchInfo) throw new Error(`Internal error: empty Gen list`);
    return { gen, matchInfo };

}