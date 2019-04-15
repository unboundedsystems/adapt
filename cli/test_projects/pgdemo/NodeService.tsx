import Adapt, { Handle, Sequence } from "@usys/adapt";
import { Container, Environment, handles, NetworkService, Service, useBuildNodeContainer } from "@usys/cloud";

export type Env = Environment;

export default function NodeService(props: {
    srcDir: string, port: number, externalPort?: number, env: Env, deps?: Handle | Handle[]
}) {
    const { image, buildObj } = useBuildNodeContainer(props.srcDir);
    const h = handles();
    const externalPort = props.externalPort || props.port;

    return <Sequence>
        {props.deps || []}
        {buildObj}
        <Service>
            <NetworkService
                endpoint={h.create.nodeCtr}
                port={externalPort}
                targetPort={props.port}
                scope="external"
            />
            {image ?
                <Container
                    name="node-service"
                    handle={h.nodeCtr}
                    environment={props.env}
                    image={image.nameTag!}
                    ports={[ props.port ]}
                    portBindings={{ [props.port]: props.port }}
                    imagePullPolicy="Never"
                />
                : null}
        </Service>
    </Sequence>;
}
