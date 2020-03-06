/*
 * Copyright 2020 Unbounded Systems, LLC
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

import fs from "fs-extra";
import json5 from "json5";
import { InternalError } from "./internal_error";

export { stringify } from "json5";

/**
 * Options for {@link readJson5}.
 * @public
 */
export type JSONReviver = (key: any, value: any) => any;

/**
 * Options for {@link readJson5}.
 * @public
 */
export interface ReadOptions extends ParseOptions {
    encoding?: string;
    flag?: string;
}

/**
 * Read a file from disk and parse as JSON5.
 * @remarks
 * Intended to be a drop-in replacement for fs-extra's readJson. Also adds more
 * helpful error message upon parse failure.
 * @public
 */
export async function readJson5(file: string, options: ReadOptions = {}) {
    const contents = (await fs.readFile(file, options)).toString();
    return parseJson5(contents, options);
}

/**
 * Options for {@link parseJson5}.
 * @public
 */
export interface ParseOptions {
    /**
     * When true, if parsing fails and a `SyntaxError` is thrown, replace the
     * default `message` property * with one that includes the offending input
     * line and a pointer to the character column. The original error message
     * is available in the `originalMessage` property of the `SyntaxError`
     * object.
     * When false, errors thrown by the JSON5 parser are not modified.
     * @defaultValue true
     */
    prettyError?: boolean;

    reviver?: JSONReviver;
    /**
     * When true, JSON5 parsing errors will throw a `SyntaxError`.
     * When false, parsing errors will not throw and the function will return
     * `null`.
     * @defaultValue true
     */
    throws?: boolean;
}

const defaultParseOptions = {
    prettyError: true,
    throws: true,
};

/**
 * Parse a string with JSON5.
 * @remarks
 * Drop-in replacement for json5.parse and adds the 'throws' option from
 * fs-extra's readJson as well as more helpful error message upon parse
 * failure.
 * @public
 */
export function parseJson5(text: string, options?: ParseOptions | JSONReviver): any {
    const inOpts =
        options === undefined ? {} :
        typeof options === "function" ? { reviver: options } :
        options;
    const { prettyError, reviver, throws } = { ...defaultParseOptions, ...inOpts };

    try {
        return json5.parse(text, reviver);
    } catch (err) {
        if (!throws) return null;
        if (prettyError) err = prettifySyntaxError(err, text);
        throw err;
    }
}

function prettifySyntaxError(err: any, contents: string) {
    if (!err || err.name !== "SyntaxError") return err;
    const { columnNumber, lineNumber } = err;
    if (columnNumber == null || lineNumber == null) return err;
    const lines = contents.split(/\r?\n/g, lineNumber);
    if (lines.length !== lineNumber) {
        throw new InternalError(`Attempted to display JSON5 error, but wrong number ` +
            `of lines found (expected=${lineNumber} actual=${lines.length}).\n` +
            `Original error: ${err.message}`);
    }
    err.originalMessage = err.message;
    const errInfo = err.message.replace(/ at \d+:\d+/, "");
    const msg = [
        `Error while parsing ${errInfo} at line ${lineNumber}, column ${columnNumber}:`,
        lines[lineNumber - 1], // lineNumber is 1-based
        " ".repeat(columnNumber - 1) + "^-- error here",
    ];
    err.message = msg.join("\n");
    return err;
}
