import { CommonOptions, run } from "./common";

export interface CiOptions extends CommonOptions {
    production?: boolean;
}

const defaultOptions: CiOptions = {};

export function ci(options?: CiOptions) {
    const finalOpts = { ...defaultOptions, ...options };

    return run("ci", finalOpts);
}
