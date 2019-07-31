import {
    getErrors,
    getWarnings,
    InternalError,
    isUserError,
    MessageClient,
    MessageLogger,
    MessageStreamClient,
    MessageStreamServer,
} from "@adpt/utils";
import { Command, flags } from "@oclif/command";
import * as Parser from "@oclif/parser";
import chalk from "chalk";
import { PassThrough } from "stream";
import { UserError } from "../error";
import { ApiResponse, ApiSuccess } from "../types/adapt_shared";
import { HasFlags, OutputFlags } from "../types/common";

export interface OutputSettings {
    // NOTE: type is any because the types for ListrOptions do not include the
    // options for the renderers.
    listrOptions: any;
    logging: boolean;
    statusOutput: boolean;
}

const outputSettings: { [ name: string ]: OutputSettings } = {
    pretty: {
        listrOptions: {
            renderer: "update",
            collapse: false,
        },
        logging: false,
        statusOutput: true,
    },

    notty: {
        listrOptions: {
            renderer: "verbose",
        },
        logging: true,
        statusOutput: true,
    },

    interactive: {
        listrOptions: {
            renderer: "verbose",
        },
        logging: false,
        statusOutput: true,
    },

    quiet: {
        listrOptions: {
            renderer: "silent",
        },
        logging: false,
        statusOutput: false,
    },
};

export interface StandardFlags {
    debug?: string;
    quiet?: boolean;
}

export function getOutputSettings(theFlags: StandardFlags, interactive = false): OutputSettings {
    let output = process.stdout.isTTY ? "pretty" : "notty";

    if (interactive) {
        output = "interactive";
    } else {
        if (theFlags.quiet) output = "quiet";

        // If debugs are enabled, override pretty
        if (output === "pretty" && (theFlags.debug || process.env.DEBUG)) {
            output = "notty";
        }
    }

    const settings = outputSettings[output];
    if (!settings) throw new UserError(`Invalid --output type "${output}"`);
    return settings;
}

export interface HandleResponseOptions {
    errorStart?: string;
    errorEnding?: string;
    action?: string;
}

const defaultHandleResponseOptions = {
    errorStart: "",
    errorEnding: "",
};

export interface OutputBlob {
    text: string;
    outputOnError: boolean;  // Still output this text even if there's an error?
}

export abstract class AdaptBase extends Command {
    static flags = {
        quiet: flags.boolean({
            allowNo: false,
            char: "q",
            description:
                "Suppress status output messages. Still outputs any result " +
                "output.",
        }),
    };

    _args?: { [name: string]: any };
    _cmdArgv?: string[];
    _flags?: { [name: string]: any };
    finalOutput: OutputBlob[] = [];
    _interactive = false;
    outputSettings_?: OutputSettings;

    get args() {
        if (this._args == null) throw new InternalError(`_args is null`);
        return this._args;
    }

    get cmdArgv() {
        if (this._cmdArgv == null) throw new InternalError(`_cmdArgv is null`);
        return this._cmdArgv;
    }

    get outputSettings(): OutputSettings {
        if (!this.outputSettings_) {
            throw new InternalError(`must call this.parse before accessing outputSettings`);
        }
        return this.outputSettings_;
    }

    // This allows retrieval of flags with correct typings (or at least as
    // correct as oclif currently provides us).
    // The argument is the derived class constructor (which contains the
    // flags configuration from which the types are derived).
    flags<Ctor extends HasFlags>(_: Ctor): OutputFlags<Ctor> {
        if (this._flags == null) throw new InternalError(`_flags is null`);
        return this._flags as any;
    }

    get interactive(): boolean { return this._interactive; }
    set interactive(val: boolean) {
        this.outputSettings_ = getOutputSettings(this.flags(AdaptBase), val);
    }

    async finally(err?: Error) {
        await super.finally(err);

        let output = this.finalOutput
            .filter((o) => (err === undefined) || o.outputOnError)
            .map((o) => o.text)
            .join("\n");
        if (output) {
            if (this.outputSettings_ && this.outputSettings_.statusOutput === true) {
                output = "\n" + output;
            }
            if (err !== undefined) output += "\n";
            this.log(output);
        }

        if (isUserError(err)) return this.error(err.userError);
    }

    about(theFlags: StandardFlags) {
        if (theFlags.quiet || !process.stdout.isTTY) return;

        const bright = chalk.bold;
        const company = chalk.bold.magentaBright;
        const ver = chalk.dim;

        const version = `[CLI v${this.config.version}]`;
        this.log(`${bright("Adapt")} by ${company("Unbounded Systems")} ${ver(version)}\n`);
    }

    appendOutput(text: string, outputOnError = false) {
        this.finalOutput.push({ text, outputOnError });
    }

    /* Synonym for handleApiResponse */
    isApiSuccess(response: ApiResponse, options: HandleResponseOptions = {}): response is ApiSuccess {
        return this.handleApiResponse(response, options);
    }

    handleApiResponse(response: ApiResponse, options: HandleResponseOptions = {}): response is ApiSuccess {
        const { errorStart, errorEnding } = {
            ...defaultHandleResponseOptions,
            ...options
        };
        const action = options.action ? ` during ${options.action}` : "";

        const nwarn = response.summary.warning;
        if (nwarn > 0) {
            const warns = nwarn === 1 ? "warning" : "warnings";
            this.appendOutput(`${nwarn} ${warns} encountered${action}:\n` +
                getWarnings(response.messages), true);
        }

        const nerr = response.summary.error;
        if (nerr > 0) {
            const errors = nerr === 1 ? "error" : "errors";
            let msg = errorStart +
                `${nerr} ${errors} encountered${action}:\n` +
                getErrors(response.messages);
            if (errorEnding) msg += "\n" + errorEnding;
            return this.error(msg);
        }

        if (response.type === "error") {
            return this.error(
                errorStart + `Internal error: error response received with no error message`);
        }
        return true;
    }

    protected parse<F, A extends { [name: string]: any; }>
        (options?: Parser.Input<F>, argv?: string[]): Parser.Output<F, A> {

        const ret = super.parse<F, A>(options, argv);
        this._flags = ret.flags;
        this._args = ret.args;
        this._cmdArgv = ret.argv;
        this.outputSettings_ = getOutputSettings(ret.flags);
        this.about(ret.flags);
        return ret;
    }
}

export interface LoggerPair {
    client: MessageClient;
    logger: MessageLogger;
}

export function createLoggerPair(loggerId: string, logging: boolean): LoggerPair {
    const thru = new PassThrough();
    const client = new MessageStreamClient({
        inputStream: thru,
        outStream: logging ? process.stdout : undefined,
        errStream: logging ? process.stderr : undefined,
    });
    const logger = new MessageStreamServer(loggerId, {
        outStream: thru,
    });
    return {
        client,
        logger,
    };
}
