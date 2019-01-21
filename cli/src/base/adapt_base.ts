import { Command } from "@oclif/command";
import { getErrors, getWarnings } from "@usys/utils";
import { ApiResponse, ApiSuccess } from "../types/adapt_shared";

export interface HandleResponseOptions {
    errorMessage?: string;
    action?: string;
}

export abstract class AdaptBase extends Command {
    finalOutput = "";

    async finally(err?: Error) {
        await super.finally(err);
        if (err !== undefined) return;

        if (this.finalOutput !== "") this.log("\n" + this.finalOutput);
    }

    appendOutput(s: string) {
        this.finalOutput += s;
    }

    /* Synonym for handleApiResponse */
    isApiSuccess(response: ApiResponse, options: HandleResponseOptions = {}): response is ApiSuccess {
        return this.handleApiResponse(response, options);
    }

    handleApiResponse(response: ApiResponse, options: HandleResponseOptions = {}): response is ApiSuccess {
        const errorMessage = options.errorMessage || "";
        const action = options.action ? ` during ${options.action}` : "";

        const nwarn = response.summary.warning;
        if (nwarn > 0) {
            const warns = nwarn === 1 ? "warning" : "warnings";
            this.appendOutput(`${nwarn} ${warns} encountered${action}:\n` +
                getWarnings(response.messages));
        }

        const nerr = response.summary.error;
        if (nerr > 0) {
            const errors = nerr === 1 ? "error" : "errors";
            return this.error(
                errorMessage +
                `${nerr} ${errors} encountered${action}:\n` +
                getErrors(response.messages));
        }

        if (response.type === "error") {
            return this.error(
                errorMessage + `Internal error: error response received with no error message`);
        }
        return true;
    }
}
