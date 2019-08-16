/*
 * Copyright 2018-2019 Unbounded Systems, LLC
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

import { MessageClient, MessageLogger, MessageStreamClient, MessageStreamer } from "@adpt/utils";
import { WritableStreamBuffer } from "stream-buffers";

export interface MockLogger extends MessageLogger {
    stdout: string;
    stderr: string;
}

class MockLoggerImpl extends MessageStreamer implements MockLogger {
    // These are set in the base class
    outStream!: WritableStreamBuffer;
    errStream!: WritableStreamBuffer;

    constructor() {
        super("MockLogger", {
            outStream: new WritableStreamBuffer(),
            errStream: new WritableStreamBuffer(),
            outputOptions: { from: false, timestamp: false },
        });
    }
    get stdout() {
        return this.outStream.getContentsAsString() || "";
    }
    get stderr() {
        return this.errStream.getContentsAsString() || "";
    }
}

export function createMockLogger(): MockLogger {
    return new MockLoggerImpl();
}

export interface MockLoggerClient extends MessageClient {
    stdout: string;
    stderr: string;
}

class MockLoggerClientImpl extends MessageStreamClient implements MockLoggerClient {
    // These are set in the base class
    outStream!: WritableStreamBuffer;
    errStream!: WritableStreamBuffer;

    constructor() {
        super({
            outStream: new WritableStreamBuffer(),
            errStream: new WritableStreamBuffer(),
        });
    }
    get stdout() {
        return this.outStream.getContentsAsString() || "";
    }
    get stderr() {
        return this.errStream.getContentsAsString() || "";
    }
}

export function createMockLoggerClient(): MockLoggerClient {
    return new MockLoggerClientImpl();
}
