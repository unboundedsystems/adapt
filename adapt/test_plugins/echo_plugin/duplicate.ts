import { registerPlugin } from "../../src";
import { create } from "./index";

// Registers with the same name and same create function. Not an error.
registerPlugin({
    name: "echo",
    module,
    create,
});
