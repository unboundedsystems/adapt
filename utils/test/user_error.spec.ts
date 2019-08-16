/*
 * Copyright 2019 Unbounded Systems, LLC
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
