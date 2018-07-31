import { Hook } from "@oclif/config";
import chalk from "chalk";

const bright = chalk.bold;
const company = chalk.bold.magentaBright;
const ver = chalk.dim;

const hook: Hook<"init"> = async (options) => {
    if (!process.stdout.isTTY) return;

    const version = `[CLI v${options.config.version}]`;
    // tslint:disable-next-line:no-console
    console.log(`${bright("Adapt")} by ${company("Unbounded Systems")} ${ver(version)}\n`);
};
export default hook;
