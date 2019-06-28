import Adapt, { Group, handle } from "@adpt/core";
import { useMethod } from "@adpt/cloud";
import { Postgres } from "./lib";
import { localStyle, prodStyle } from "./styles";
import TypeScriptService, { Env } from "./TypeScriptService";

function App() {
    const pgHand = handle();
    const pgEnv = useMethod<Env>(pgHand, [], "connectEnv");

    return <Group key="App">
        <Postgres handle={pgHand} />
        <TypeScriptService key="sample-service" srcDir="./code"
            port={8080} targetPort={8080}
            env={pgEnv} deps={[pgHand]} />
    </Group>;
}

Adapt.stack("prod", <App />, prodStyle);
Adapt.stack("local", <App />, localStyle);
