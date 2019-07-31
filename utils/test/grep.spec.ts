import should from "should";
import { grep } from "../src";

const text1 =
`There was a young lady named Bright
Whose speed was far faster than light;
She set out one day
In a relative way
And returned on the previous night.`;

describe("grep", () => {
    it("Should return no match for empty input", () => {
        should(grep("", "find")).eql([]);
    });

    it("Should throw error for empty pattern", () => {
        should(() => grep("some string", "")).throwError(/Invalid pattern/);
    });

    it("Should match with string", () => {
        should(grep(text1, "ight")).eql([
            "There was a young lady named Bright",
            "Whose speed was far faster than light;",
            "And returned on the previous night.",
        ]);
    });
    it("Should match with regex", () => {
        should(grep(text1, /in/i)).eql([
            "In a relative way"
        ]);
    });
});
