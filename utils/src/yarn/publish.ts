import { CommonOptions, run } from "./common";

export interface PublishOptions extends CommonOptions {
    access?: "public" | "restricted";
    nonInteractive?: boolean;
    tag?: string;
}
const boolNoArgOptions = [
    "nonInteractive",
];

const defaultOptions = {
    nonInteractive: true,
    boolNoArgOptions,
};

export function publish(directoryOrTarball: string, options?: PublishOptions) {
    const finalOpts = { ...defaultOptions, ...options };
    return run("publish", finalOpts, [directoryOrTarball]);
}
