import Adapt, { Group, handle, Handle } from "@usys/adapt";
import { Sequence, useTypescriptBuild } from "@usys/cloud";
// tslint:disable-next-line:no-submodule-imports
import { EnvVar, K8sContainer, Pod, Service } from "@usys/cloud/k8s";

export function kubeconfig() {
    // tslint:disable-next-line:no-var-requires
    return require("./kubeconfig.json");
}

export type Env = EnvVar[];

export default function TypeScriptService(props: {
    srcDir: string, port?: number, targetPort: number, env: Env, deps?: Handle[]
}) {
    const { image, buildObj } = useTypescriptBuild(props.srcDir);
    const podHandle = handle();

    return <Sequence>
        {props.deps || []}
        <Group>
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
                        env={props.env}
                        image={image.nameTag!}
                        ports={[{
                            containerPort: props.targetPort,
                            hostPort: props.targetPort
                        }]}
                        imagePullPolicy="Never"
                    />
                </Pod>
                : null}
        </Group>
    </Sequence>;
}
