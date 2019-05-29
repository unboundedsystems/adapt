import { PrimitiveComponent } from "@usys/adapt";
import { HttpServerProps } from "./http_server_types";

export abstract class HttpServer extends PrimitiveComponent<HttpServerProps> {
    static defaultProps = {
        port: 80,
        scope: "external",
    };
}
