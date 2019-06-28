import { registerPlugin } from "../../src";
import { EchoPlugin } from "./index";

function create() {
    return new EchoPlugin();
}

// Registers with same name and different create. Error.
registerPlugin({
    name: "echo",
    module,
    create,
});
