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

import { Console } from "console";
import { createWriteStream } from "fs";

export interface TtyLoggerOptions {
    fallbackOnError?: "none" | "console";
}

const defaultOptions = {
    fallbackOnError: "console",
};

const nullLog: Console["log"] = () => {/* */};
// tslint:disable: no-console
const consoleLog = console.log.bind(console);

export function createTtyLogger(options: TtyLoggerOptions = {}): Console["log"] {
    const opts = { ...defaultOptions, ...options };

    const tty = createWriteStream("/dev/tty");
    let log: Console["log"];

    const logger = new Console(tty, tty);
    log = logger.log.bind(logger);
    tty.on("error", () => log = opts.fallbackOnError === "console" ? consoleLog : nullLog);

    return function ttyLog(...args: any[]) {
        log(...args);
    };
}
