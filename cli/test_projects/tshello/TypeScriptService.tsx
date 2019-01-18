import Adapt, { Group, handle } from "@usys/adapt";
import { useTypescriptBuild } from "@usys/cloud";
// tslint:disable-next-line:no-submodule-imports
import { K8sContainer, Pod, Service } from "@usys/cloud/k8s";

function kubeconfig() {
    // tslint:disable-next-line:no-var-requires
    return require("./kubeconfig.json");
}

export default function TypeScriptService(props: { srcDir: string, port: number, targetPort: number }) {
    const { image, buildObj } = useTypescriptBuild(props.srcDir);
    const podHandle = handle();

    return <Group>
        {buildObj}
        <Service
            config={kubeconfig()}
            type="LoadBalancer"
            selector={podHandle}
            ports={[{ port: props.port, targetPort: props.targetPort }]}
        />
        {image ?
            <Pod handle={podHandle} config={kubeconfig()} terminationGracePeriodSeconds={0}>
                <K8sContainer
                    name="typescript-service"
                    image={image.nameTag!}
                    ports={[{
                        containerPort: props.targetPort,
                        hostPort: props.targetPort
                    }]}
                    imagePullPolicy="Never"
                />
            </Pod>
            : null}
    </Group>;
}
