import { MessageLogger, MessageStreamer } from "@usys/utils";
import { WritableStreamBuffer } from "stream-buffers";

export interface MockLogger extends MessageLogger {
    stdout: string;
    stderr: string;
}

class MockLoggerImpl extends MessageStreamer {
    // These are set in the base class
    protected outStream!: WritableStreamBuffer;
    protected errStream!: WritableStreamBuffer;

    constructor() {
        super("MockLogger", new WritableStreamBuffer(),
              new WritableStreamBuffer());
    }
    get stdout() {
        return this.outStream.getContentsAsString();
    }
    get stderr() {
        return this.errStream.getContentsAsString();
    }
}

export function createMockLogger(): MockLogger {
    return new MockLoggerImpl();
}
