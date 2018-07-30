import { CommonOptions, run } from "./common";

export interface InstallOptions extends CommonOptions {
    packages?: string[];
    packageLockOnly?: boolean;
}

const defaultOptions: InstallOptions = {
    packageLockOnly: false,
};

export function install(options?: InstallOptions) {
    const { packages, ...finalOpts } = { ...defaultOptions, ...options };

    return run("install", finalOpts, packages);
}
