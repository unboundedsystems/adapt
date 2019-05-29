import Adapt, { Group, handle } from "@usys/adapt";
import { useMethod } from "@usys/cloud";
import { HttpServer, UrlRouter } from "@usys/cloud/http";
import { NodeService } from "@usys/cloud/nodejs";
import { Postgres } from "@usys/cloud/postgres";
import { k8sStyle, laptopStyle, prodStyle } from "./styles";

function App() {
    const pg = handle();
    const api = handle();
    const stat = handle();

    const connectEnv = useMethod(pg, {}, "connectEnv");

    return <Group key="App">

        <UrlRouter key="url-router"
            port={8080}
            routes={[
                { path: "/api/", endpoint: api },
                { path: "/", endpoint: stat }
            ]} />

        <NodeService key="api-service" handle={api}
            srcDir=".." env={connectEnv} deps={pg} />

        <Postgres handle={pg} />

        <HttpServer key="static-service" handle={stat} scope="cluster-internal"
            add={[{ type: "image", image: api, stage: "app",
                    files: [{ src: "/app/build", dest: "/www/static" }]}]} />

    </Group>;
}

Adapt.stack("laptop", <App />, laptopStyle);
Adapt.stack("prod", <App />, prodStyle);
Adapt.stack("k8s", <App />, k8sStyle);
