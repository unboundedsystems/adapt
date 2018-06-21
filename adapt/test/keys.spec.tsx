import {
    KeyTracker,
} from "../src/keys";
import {
    Empty,
} from "./testlib";

describe("Key Tracker", () => {
    it("Should generate unique keys for a base name", () => {
        const tracker = new KeyTracker();
        const comp = new Empty({id: 1});

        tracker.addKey(comp); // Depth 0
        tracker.lastKeyPath().should.equal("Empty");
        tracker.pathPush();
        tracker.addKey(comp); // Depth 1
        tracker.lastKeyPath().should.equal("Empty.Empty");
        tracker.addKey(comp); // Depth 1
        tracker.lastKeyPath().should.equal("Empty.Empty1");
        tracker.pathPop();

        tracker.addKey(comp); // Depth 0
        tracker.lastKeyPath().should.equal("Empty1");
        tracker.pathPush();
        tracker.addKey(comp); // Depth 1
        tracker.lastKeyPath().should.equal("Empty1.Empty");
    });
});
