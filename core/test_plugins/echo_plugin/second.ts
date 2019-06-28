import { registerPlugin } from "../../src";
import { EchoPlugin } from "./index";

function create() {
    return new EchoPlugin();
}

// Registers with different name and different create. Not an error.
registerPlugin({
    name: "second",
    module,
    create,
});
