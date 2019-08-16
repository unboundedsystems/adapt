/*
 * Copyright 2019 Unbounded Systems, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
