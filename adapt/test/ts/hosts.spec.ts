import should from "should";
import * as sinon from "sinon";

import {
    ChainableHost,
    chainHosts,
    HostFinal,
    MemoryHost,
} from "../../src/ts";

describe("Hosts basic tests", () => {
    it("Should canonicalize on basic derived class", () => {
        class Test extends ChainableHost { }
        const underTest = new Test("/foo");
        const chained = new Test("/foo");
        const fake = sinon.fake(chained.fileExists.bind(chained));
        sinon.replace(chained, "fileExists", fake);
        const chain = chainHosts(
            underTest,
            chained,
            new HostFinal("/foo")
        );

        chain.fileExists("bar.txt");
        fake.lastCall.args[0].should.equal("/foo/bar.txt");
    });

    it("Should pass through unimplemented methods", () => {
        class Test extends ChainableHost { }
        const testHost = new Test("/foo");
        const memHost = new MemoryHost("/", "/foo");
        const chain = chainHosts(
            testHost,
            memHost,
            new HostFinal("/foo")
        );

        chain.writeFile("testfile", "some stuff", false);

        memHost.fileExists("testfile").should.be.True();
        chain.fileExists("testfile").should.be.True();
        should(chain.readFile("testfile")).equal("some stuff");
    });
});

describe("MemoryHost", () => {
    it("Should handle relative paths", () => {
        const chain = chainHosts(
            new MemoryHost("/", "/base/dir"),
            new HostFinal("/base/dir")
        );

        chain.writeFile("relative.file", "some data", false);
        should(chain.fileExists("relative.file")).be.True();
        should(chain.fileExists("/base/dir/relative.file")).be.True();
        should(chain.readFile("relative.file")).equal("some data");
        should(chain.readFile("/base/dir/relative.file")).equal("some data");
        should(chain.readFile("/relative.file")).be.Undefined();
        should(chain.fileExists("/relative.file")).be.False();

        should(chain.fileExists("/base/foo/../dir/relative.file")).be.True();
        should(chain.fileExists("zoo/../relative.file")).be.True();
        should(chain.fileExists("../../../base/dir/relative.file")).be.True();
    });
});
