import should from "should";
import { formatUserError, isUserError, UserError } from "../src/user_error";

describe("formatUserError", () => {
    it("Should only return message for UserError", () => {
        const msg = formatUserError(new UserError(`a message`));
        should(msg).equal("a message");
    });

    it("Should return source mapped backtrace for standard errors", () => {
        const msg = formatUserError(new Error(`a message`));
        should(msg).startWith("Error: a message\n");
        should(msg).match(/user_error.spec.ts:/);
    });

    it("Should return error name and message when stack=false", () => {
        const msg = formatUserError(new Error(`a message`), false);
        should(msg).equal("Error: a message");
    });
});

describe("isUserError", () => {
    it("Should be true for UserError", () => {
        should(isUserError(new UserError("a message"))).equal(true);
    });

    it("Should be true for Error with userError property", () => {
        const err: any = new Error("a message");
        err.userError = "an error";
        should(isUserError(err)).equal(true);
    });

    it("Should be false for Error without userError property", () => {
        const err: any = new Error("a message");
        should(isUserError(err)).equal(false);
    });

    it("Should be false for non Error object", () => {
        const err = {
            message: "a message",
            userError: "a message",
            name: "UserError",
        };
        should(isUserError(err)).equal(false);
    });

});
