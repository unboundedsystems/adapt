import Adapt, { handle, Group, BuiltinProps } from "@usys/adapt";
import { Pod, K8sContainer } from "@usys/cloud/k8s";

function App(props: any) {
    return null;
}

function localTypescriptBuild(srcDir: string) {
    //implement me
    return "FIXME";
}

async function TypescriptBuilder(props: { srcDir: string } & BuiltinProps) {
    //do build locally for now
    const imgSha = await localTypescriptBuild(props.srcDir);
    useInstanceMethod(() => ({
        buildComplete: () => true,
        imgSha
    }));
    return null;
}

function useTypescriptBuild(srcDir: string) {
    const { buildState, setBuildState } = useState("build");
    const buildHand = handle();

    setBuildState(async () => {
        if (!buildHand.mountedOrig) return "build";
        if (buildHand.mountedOrig.instance.buildComplete()) {
            return buildHand.mountedOrig.instance.imgSha;
        }
    });

    if (buildState === "build") {
        return { buildObj: <TypescriptBuilder handle={buildHand} srcDir={srcDir} /> };
    }

    return { imgSha: buildState, buildObj: null };
}

function TypeScriptService(props: any) {
    const { imgSha, buildObj } = useTypescriptBuild(props.src);

    return <Group>
        {buildObj}
        {imgSha ? <Pod config={{}}><K8sContainer name="app" image={imgSha} /></Pod> : null}
    </Group>;
}

const root =
    <App>
        <TypeScriptService src="./code" port="8080" />
    </App>

Adapt.stack("prod", root, null);