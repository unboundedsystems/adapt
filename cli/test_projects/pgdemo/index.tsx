import Adapt, { Group, handle } from "@usys/adapt";
import { useMethod } from "@usys/cloud";
import { Postgres } from "./lib";
import NodeService, { Env } from "./NodeService";
import { laptopStyle, prodStyle } from "./styles";

function App() {
    const pgHand = handle();
    const pgEnv = useMethod<Env>(pgHand, [], "connectEnv");

    return <Group key="App">
        <Postgres handle={pgHand} />
        <NodeService key="sample-service" srcDir="./code"
            port={8080} env={pgEnv} deps={pgHand} />
    </Group>;
}

Adapt.stack("laptop", <App />, laptopStyle);
Adapt.stack("prod", <App />, prodStyle);
