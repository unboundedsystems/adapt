import Adapt, { Group } from "@usys/adapt";
import { handles } from "@usys/cloud";
// tslint:disable-next-line:no-submodule-imports
import { Postgres } from "@usys/cloud/postgres";
import NodeService from "./NodeService";
import { k8sStyle, laptopStyle, prodStyle } from "./styles";

function App() {
    const h = handles();

    return <Group key="App">
        <Postgres handle={h.create.pg} />
        <NodeService key="sample-service" srcDir=".."
            port={8080} env={h.pg.connectEnv()} deps={h.pg} />
    </Group>;
}

Adapt.stack("laptop", <App />, laptopStyle);
Adapt.stack("prod", <App />, prodStyle);
Adapt.stack("k8s", <App />, k8sStyle);
