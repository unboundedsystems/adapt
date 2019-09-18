import Adapt, { Group } from "@adpt/core";
import TypeScriptService from "./TypeScriptService";

function App() {
    return <Group>
        <TypeScriptService srcDir="./code" port={8088} targetPort={8080} />
    </Group>;
}

Adapt.stack("prod", <App />, null);
