import Adapt, { Group, handle, Handle } from "@usys/adapt";
import { Sequence, useBuildNodeContainer } from "@usys/cloud";
// tslint:disable-next-line:no-submodule-imports
import { EnvVar, K8sContainer, Pod, Service } from "@usys/cloud/k8s";

export function kubeconfig() {
    // tslint:disable-next-line:no-var-requires
    return require("./kubeconfig.json");
}

export type Env = EnvVar[];

export default function NodeService(props: {
    srcDir: string, port: number, externalPort?: number, env: Env, deps?: Handle | Handle[]
}) {
    const { image, buildObj } = useBuildNodeContainer(props.srcDir);
    const podHandle = handle();
    const externalPort = props.externalPort || props.port;

    return <Sequence>
        {props.deps || []}
        <Group>
            {buildObj}
            <Service
                config={kubeconfig()}
                type="LoadBalancer"
                selector={podHandle}
                ports={[{ port: externalPort, targetPort: props.port }]}
            />
            {image ?
                <Pod handle={podHandle} config={kubeconfig()} terminationGracePeriodSeconds={0}>
                    <K8sContainer
                        name="node-service"
                        env={props.env}
                        image={image.nameTag!}
                        ports={[{
                            containerPort: props.port,
                            hostPort: props.port
                        }]}
                        imagePullPolicy="Never"
                    />
                </Pod>
                : null}
        </Group>
    </Sequence>;
}
