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
import jju from "jju";
import json5 from "json5";
import { ReadonlyDeepT } from "type-ops";
import { AnyObject } from "./common_types";
import { InternalError } from "./internal_error";

export { stringify as stringifyJson5 } from "json5";

// TODO: These JSON definitions aren't exactly right because TS < 3.7 doesn't
// allow recursive types. Update to recursive types once we update TS.
export type JsonValue = string | number | boolean | null | AnyObject | any[];
export type JsonValueReadonly = string | number | boolean | null | ReadonlyDeepT<AnyObject> | ReadonlyArray<any>;

/**
 * Reviver function from the standard JSON spec
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

    // Typical error: JSON5: invalid character '=' at 2:6
    err.originalMessage = err.message;
    const errInfo = err.message.replace(/^JSON5: /, "").replace(/ at \d+:\d+/, "");

    const msg = [
        `Invalid JSON5 format: ${errInfo} at line ${lineNumber}, column ${columnNumber}:`,
        lines[lineNumber - 1], // lineNumber is 1-based
        " ".repeat(columnNumber - 1) + "^-- error here",
    ];
    err.message = msg.join("\n");
    return err;
}

// TODO: Should extend ReadOptions (i.e. common interface for all read functions)
export interface Json5WriterReadOptions {
    encoding?: string;
    flag?: string;
    mustExist?: boolean;
    reviver?: JSONReviver;
}

const defaultReadOptions = {
    mustExist: true,
};

export interface Json5WriterOptions {
    /**
     * Attempt to match the style present in the existing file.
     */
    matchStyle?: boolean;
    /**
     * If matchStyle is true, these options are only used if no file currently
     * exists. If matchStyle is false, these options are used on every update.
     */
    style?: jju.StringifyOptions;
}

const defaultJson5WriterOptions = {
    matchStyle: true,
    style: {
        quote_keys: false,
        indent: 2,
    },
};

/**
 * Make updates to a JSON/JSON5 config file that might be updated by humans.
 * Retains comments and optionally attempts to preserve style already present
 * in the file.
 */
export class Json5Writer {
    private _options: Required<Json5WriterOptions>;
    private _text?: string;
    private _value?: any;

    constructor(readonly filename: string, options: Json5WriterOptions = {}) {
        this._options = { ...defaultJson5WriterOptions, ...options };
    }

    get text(): string | undefined {
        return this._text;
    }

    get value(): JsonValueReadonly | undefined {
        return this._value;
    }

    async read(options: Json5WriterReadOptions = {}) {
        const opts = { ...defaultReadOptions, ...options };
        try {
            this._text = (await fs.readFile(this.filename, opts)).toString();
        } catch (err) {
            // If it's ok that the file doesn't exist, return undefined to
            // let the caller know.
            if (err && err.code === "ENOENT" && !opts.mustExist) return undefined;
            throw err;
        }

        this._value = jju.parse(this._text, opts);
        return this.value;
    }

    async update(newValue: JsonValueReadonly) {
        const orig = this._text !== undefined ? this._text : "null\n";
        const opts = this._text === undefined || !this._options.matchStyle ?
            this._options.style : undefined;

        const newText = jju.update(orig, newValue, opts);
        await fs.writeFile(this.filename, newText);
        this._text = newText;
        this._value = newValue;
    }
}

export async function createJson5Writer(filename: string,
    options: Json5WriterOptions & Json5WriterReadOptions = {}) {
    const writer = new Json5Writer(filename, options);
    await writer.read(options);
    return writer;
}
