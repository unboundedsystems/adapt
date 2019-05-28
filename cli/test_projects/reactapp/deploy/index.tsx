import Adapt, { Group, handle } from "@usys/adapt";
import { useMethod } from "@usys/cloud";
import { NodeService } from "@usys/cloud/nodejs";
import { Postgres } from "@usys/cloud/postgres";
import NginxStatic from "./NginxStatic";
import NginxUrlRouter from "./NginxUrlRouter";
import { k8sStyle, laptopStyle, prodStyle } from "./styles";

function App() {
    const pg = handle();
    const api = handle();
    const stat = handle();

    const connectEnv = useMethod(pg, {}, "connectEnv");

    return <Group key="App">

        <NginxUrlRouter key="url-router"
            port={8080}
            routes={[
                { path: "/api/", endpoint: api, upstreamPath: "/api/" },
                { path: "/", endpoint: stat }
            ]} />

        <NodeService key="api-service" handle={api}
            srcDir=".." env={connectEnv} deps={pg} />

        <Postgres handle={pg} />

        <NginxStatic key="static-service" handle={stat}
            localAddRoot="../public" scope="cluster-internal"
            add={[{ type: "image", image: api, stage: "app",
                    files: [{ src: "/app/build", dest: "/www/static" }]}]} />

    </Group>;
}

Adapt.stack("laptop", <App />, laptopStyle);
Adapt.stack("prod", <App />, prodStyle);
Adapt.stack("k8s", <App />, k8sStyle);
