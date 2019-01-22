import pDefer from "p-defer";
import should from "should";
import sinon from "sinon";
import { PassThrough } from "stream";
import { ReadableStreamBuffer, WritableStreamBuffer } from "stream-buffers";
import {
    Message,
    MessageStreamClient,
    MessageStreamer,
    MessageStreamServer,
    MessageType,
} from "../src/message";

function checkMessage(msg: any, type: string, id = "testid") {
    should(msg).be.an.Object();
    should(msg.from).equal(id);
    should(msg.type).equal(type);
    should(msg.content).equal(`Testing ${type} from ${id}`);
    should(msg.timestamp).be.a.Number();
}

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

        should(ms.summary).eql({
            info: 1,
            warning: 0,
            error: 1,
            task: 0
        });
    });
});

describe("MessageStreamServer tests", () => {
    it("Should combine messages onto output stream", () => {
        const outStream = new WritableStreamBuffer();
        const server = new MessageStreamServer("testid", { outStream });

        server.warning("Testing warning from testid");
        server.info("Testing info from testid");
        server.error("Testing error from testid");
        server.log(MessageType.task, "Testing task from testid");

        should(server.messages).have.length(4);
        checkMessage(server.messages[0], "warning");
        checkMessage(server.messages[1], "info");
        checkMessage(server.messages[2], "error");
        checkMessage(server.messages[3], "task");

        const out = outStream.getContentsAsString();
        const jsons = out.split("\n").filter((s) => s);
        const msgs = jsons.map((s) => JSON.parse(s));
        should(msgs).have.length(4);
        checkMessage(msgs[0], "warning");
        checkMessage(msgs[1], "info");
        checkMessage(msgs[2], "error");
        checkMessage(msgs[3], "task");

        should(server.summary).eql({
            info: 1,
            warning: 1,
            error: 1,
            task: 1
        });
    });

    it("Should support message ID hierarchy", () => {
        const outStream = new WritableStreamBuffer();
        const root = new MessageStreamServer("root", { outStream });
        const kid1 = new MessageStreamServer("kid1", { parent: root });
        const kid2 = new MessageStreamServer("kid2", { parent: kid1 });

        root.warning("Testing warning from root");
        kid1.info("Testing info from root:kid1");
        kid2.error("Testing error from root:kid1:kid2");
        root.log(MessageType.task, "Testing task from root");

        should(root.messages).have.length(4);
        checkMessage(root.messages[0], "warning", "root");
        checkMessage(root.messages[1], "info", "root:kid1");
        checkMessage(root.messages[2], "error", "root:kid1:kid2");
        checkMessage(root.messages[3], "task", "root");

        const out = outStream.getContentsAsString();
        const jsons = out.split("\n").filter((s) => s);
        const msgs = jsons.map((s) => JSON.parse(s));
        should(msgs).have.length(4);
        checkMessage(msgs[0], "warning", "root");
        checkMessage(msgs[1], "info", "root:kid1");
        checkMessage(msgs[2], "error", "root:kid1:kid2");
        checkMessage(msgs[3], "task", "root");

        should(root.summary).eql({
            info: 1,
            warning: 1,
            error: 1,
            task: 1
        });
    });
});

describe("MessageStreamClient tests", () => {
    it("Should read from input stream", async () => {
        const inputStream = new ReadableStreamBuffer();
        const outStream = new WritableStreamBuffer();
        const errStream = new WritableStreamBuffer();
        const client = new MessageStreamClient({
            inputStream,
            outStream,
            errStream
        });
        const iSpy = sinon.spy();
        const wSpy = sinon.spy();
        const eSpy = sinon.spy();
        const tSpy = sinon.spy();
        const done = pDefer<Message>();

        client.info.on("message:*", iSpy);
        client.warning.on("message:*", wSpy);
        client.error.on("message:*", eSpy);
        client.task.on("task:**", tSpy);
        client.info.on("close", done.resolve);

        const inMsgs: Message[] = [
            {
                type: MessageType.warning, content: "Testing warning from testid",
                from: "testid", timestamp: 10,
            },
            {
                type: MessageType.info, content: "Testing info from testid",
                from: "testid", timestamp: 11,
            },
            {
                type: MessageType.error, content: "Testing error from testid",
                from: "testid", timestamp: 12,
            },
            {
                type: MessageType.task, content: "[Created]",
                from: "testid", timestamp: 13,
            },
            {
                type: MessageType.task, content: "[Status]: Some status",
                from: "testid", timestamp: 13,
            },
        ];
        const inStr = inMsgs.map((m) => JSON.stringify(m)).join("\n");
        inputStream.put(inStr + "\n");
        inputStream.stop();

        await done.promise;

        const out = outStream.getContentsAsString();
        should(out).equal(
            "Thu, 01 Jan 1970 00:00:00 GMT [testid] WARNING: Testing warning from testid\n" +
            "Thu, 01 Jan 1970 00:00:00 GMT [testid] INFO: Testing info from testid\n"
        );
        const err = errStream.getContentsAsString();
        should(err).equal(
            "Thu, 01 Jan 1970 00:00:00 GMT [testid] ERROR: Testing error from testid\n"
        );

        should(iSpy.callCount).equal(1);
        should(iSpy.getCall(0).args[0]).eql(inMsgs[1]);

        should(wSpy.callCount).equal(1);
        should(wSpy.getCall(0).args[0]).eql(inMsgs[0]);

        should(eSpy.callCount).equal(1);
        should(eSpy.getCall(0).args[0]).eql(inMsgs[2]);

        should(tSpy.callCount).equal(2);
        should(tSpy.getCall(0).args[0]).eql("Created");
        should(tSpy.getCall(0).args[1]).eql(undefined);
        should(tSpy.getCall(1).args[0]).eql("Status");
        should(tSpy.getCall(1).args[1]).eql("Some status");
    });
});

describe("MessageStreamServer + MessageStreamClient tests", () => {
    it("Should pass through events", async () => {
        const thru = new PassThrough();
        const outStream = new WritableStreamBuffer();
        const errStream = new WritableStreamBuffer();
        const client = new MessageStreamClient({
            inputStream: thru,
            outStream,
            errStream
        });
        const server = new MessageStreamServer("testid", { outStream: thru });

        const iSpy = sinon.spy();
        const wSpy = sinon.spy();
        const eSpy = sinon.spy();
        const tSpy = sinon.spy();
        const done = pDefer<Message>();

        client.info.on("message:*", iSpy);
        client.warning.on("message:*", wSpy);
        client.error.on("message:*", eSpy);
        client.task.on("task:**", tSpy);
        client.info.on("close", done.resolve);

        server.warning("Testing warning from testid");
        server.info("Testing info from testid");
        server.error("Testing error from testid");
        server.log(MessageType.task, "[Created]");
        server.log(MessageType.task, "[Status]: Some status");

        should(iSpy.callCount).equal(1);
        checkMessage(iSpy.getCall(0).args[0], "info");

        should(wSpy.callCount).equal(1);
        checkMessage(wSpy.getCall(0).args[0], "warning");

        should(eSpy.callCount).equal(1);
        checkMessage(eSpy.getCall(0).args[0], "error");

        should(tSpy.callCount).equal(2);
        should(tSpy.getCall(0).args[0]).eql("Created");
        should(tSpy.getCall(0).args[1]).eql(undefined);
        should(tSpy.getCall(1).args[0]).eql("Status");
        should(tSpy.getCall(1).args[1]).eql("Some status");
    });
});
