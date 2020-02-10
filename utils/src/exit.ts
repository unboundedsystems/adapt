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

import * as GracefulType from "@unboundedsystems/node-graceful";
import { MaybePromise } from "./common_types";
import { processGlobal } from "./process_global";

export type ExitHandler = (signal: string, details?: object | number) => MaybePromise<void | any>;
export type RemoveHandler = () => void;

interface ExitGlobals {
    capExit: any;
    graceful: typeof GracefulType.default;
    handlers: Map<ExitHandler, number>;
}

const exitGlobals = processGlobal<ExitGlobals>("exitGlobals", () => {
    const g = {
        capExit: require("capture-exit"),
        graceful: require("@unboundedsystems/node-graceful"),
        handlers: new Map<ExitHandler, number>(),
    };

    g.capExit.captureExit();

    return g;
});

const { capExit, graceful } = exitGlobals;

/**
 * Register a callback that will get called no matter how the process exits.
 * @remarks
 * If `handler` returns a `Promise`, exit will be delayed until the promise
 * resolves.
 */
export function onExit(handler: ExitHandler): RemoveHandler {
    const capHandler = (code: number) => handler("exit", code);
    capExit.onExit(capHandler);

    const graceHandler = (sig: string, details: object | undefined) => {
        capExit.offExit(capHandler);
        return handler(sig, details);
    };
    graceful.on("exit", graceHandler);

    return () => {
        capExit.offExit(capHandler);
        graceful.off("exit", graceHandler);
    };
}
