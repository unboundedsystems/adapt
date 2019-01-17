import { CommonOptions, run } from "./common";

export interface AddOptions extends CommonOptions {
    dev?: boolean;
    peer?: boolean;
    optional?: boolean;
    exact?: boolean;
    tilde?: boolean;
}
const boolNoArgOptions = [
    "dev",
    "peer",
    "optional",
    "exact",
    "tilde",
];

const defaultOptions = {
    boolNoArgOptions,
};

export function add(options: AddOptions = {}) {
    const finalOpts = { ...defaultOptions, ...options };
    return run("add", finalOpts);
}
