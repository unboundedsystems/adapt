import { CommonOptions, run } from "./common";

export interface CacheCleanOptions extends CommonOptions {
}

export function cacheClean(packageName?: string | undefined, options: CacheCleanOptions = {}) {
    const args = ["clean"];
    if (packageName !== undefined) args.push(packageName);
    return run("cache", options, args);
}
