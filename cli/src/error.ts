import { CustomError } from "ts-custom-error";

/**
 * An Error that is already formatted for user consumption and should
 * not have a backtrace displayed.
 */
export class UserError extends CustomError { }
