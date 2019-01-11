import Adapt, { Group } from "@usys/adapt";
import TypeScriptService from "./TypeScriptService";

const root = <Group>
    <TypeScriptService srcDir="./code" port={8088} targetPort={8080} />
</Group>;

Adapt.stack("prod", root, null);
