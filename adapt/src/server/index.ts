export {
    adaptServer,
    AdaptServer,
    ServerOptions,
} from "./server";
export {
    LocalServerOptions,
} from "./local_server";

import { register } from "./server";

import { LocalServer } from "./local_server";
register(LocalServer);
