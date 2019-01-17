import { CommonOptions, run } from "./common";

export interface InstallOptions extends CommonOptions {
    frozenLockfile?: boolean;
    production?: boolean;
    preferOffline?: boolean;
}
const boolNoArgOptions = [
    "preferOffline",
];

const defaultOptions = {
    boolNoArgOptions,
};

export function install(options?: InstallOptions) {
    const finalOpts = { ...defaultOptions, ...options };
    return run("install", finalOpts);
}
