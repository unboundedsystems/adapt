import * as should from "should";
import { WritableStreamBuffer } from "stream-buffers";
import { MessageStreamer } from "../src/message";

describe("MessageStreamer tests", () => {
    it("Should allow using info and error as standalone function", () => {
        const outStream = new WritableStreamBuffer();
        const errStream = new WritableStreamBuffer();
        const ms = new MessageStreamer("MS Test", { outStream, errStream });

        const info = ms.info;
        const error = ms.error;

        info("Testing info");
        error("Testing error");

        should(ms.messages).have.length(2);

        should(ms.messages[0].type).equal("info");
        should(ms.messages[0].content).equal("Testing info");
        should(ms.messages[0].from).equal("MS Test");

        should(ms.messages[1].type).equal("error");
        should(ms.messages[1].content).equal("Testing error");
        should(ms.messages[1].from).equal("MS Test");

        const stdout = outStream.getContentsAsString();
        const stderr = errStream.getContentsAsString();
        should(stdout).match(/^.*\[MS Test\] INFO: Testing info\n$/);
        should(stderr).match(/^.*\[MS Test\] ERROR: Testing error\n$/);
    });
});
