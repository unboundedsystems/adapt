import { isError } from "lodash";
import { CustomError } from "ts-custom-error";
import { ensureError } from "./ensure_error";

/**
 * An Error that is already formatted for user consumption and should
 * not have a backtrace displayed.
 */
export class UserError extends CustomError {
    get userError(): string { return this.message; }
}

export interface IUserError extends Error {
    userError: string;
}

export function isUserError(err: unknown): err is IUserError {
    return isError(err) && typeof (err as any).userError === "string";
}

export function formatUserError(err: any, stack = true): string {
    err = ensureError(err);
    const userMsg = err.userError;
    if (userMsg) return userMsg;
    return stack ? err.stack : err.toString();
}
