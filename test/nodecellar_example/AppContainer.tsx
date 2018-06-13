import unbs, { Component } from "../../src";
import Container, { ImageId } from "../../ulib/Container";

export interface Props {
    mongoHostname: string;
    mongoPort: number;
    dockerHost: string;

    name?: string;
    ctrPort?: number;
    port?: number;
    image?: ImageId;
}

export default class AppContainer extends Component<Props> {
    static defaultProps = {
        name: "nodecellar",
        ctrPort: 8080,
        port: 8080,
        image: {
            repository: "uric/nodecellar"
        }
    };

    build() {
        const props = this.props;

        return (
            <Container
                name={props.name!}
                dockerHost={props.dockerHost!}
                image={props.image!}
                ports={[ props.ctrPort! ]}
                stdinOpen={true}
                tty={true}
                command="nodejs server.js"
                environment={{
                    NODECELLAR_PORT: props.ctrPort!.toString(),
                    MONGO_PORT: props.mongoPort.toString(),
                    MONGO_HOST: props.mongoHostname,
                }}
                links={{
                    mongod: props.mongoHostname,
                }}
                portBindings={{
                    // ctr port : host port
                    [props.ctrPort!]: props.port!,
                }}
            />
        );
    }
}
