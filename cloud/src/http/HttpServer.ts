import { PrimitiveComponent } from "@adpt/core";
import { HttpServerProps } from "./http_server_types";

export abstract class HttpServer extends PrimitiveComponent<HttpServerProps> {
    static defaultProps = {
        port: 80,
        scope: "external",
    };
}
