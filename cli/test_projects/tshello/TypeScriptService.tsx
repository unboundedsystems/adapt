import Adapt, { Group, handle } from "@adpt/core";
import { K8sContainer, Pod, Service } from "@adpt/cloud/k8s";
import { useTypescriptBuild } from "@adpt/cloud/nodejs";

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
