import { ImageInfo, useMethod } from "@adpt/cloud";
import { K8sContainer, Pod, Service } from "@adpt/cloud/k8s";
import { LocalNodeImage } from "@adpt/cloud/nodejs";
import Adapt, { Group, handle } from "@adpt/core";

function kubeconfig() {
    // tslint:disable-next-line:no-var-requires
    return require("./kubeconfig.json");
}

export default function TypeScriptService(props: { srcDir: string, port: number, targetPort: number }) {
    const podHandle = handle();

    const img = handle();
    const imageInfo = useMethod<ImageInfo | undefined>(img, undefined, "latestImage");

    return <Group>
        <LocalNodeImage handle={img} srcDir={props.srcDir} options={{ runNpmScripts: "build" }} />
        <Service
            config={kubeconfig()}
            type="LoadBalancer"
            selector={podHandle}
            ports={[{ port: props.port, targetPort: props.targetPort }]}
        />
        {imageInfo ?
            <Pod handle={podHandle} config={kubeconfig()} terminationGracePeriodSeconds={0}>
                <K8sContainer
                    name="typescript-service"
                    image={imageInfo.nameTag!}
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
