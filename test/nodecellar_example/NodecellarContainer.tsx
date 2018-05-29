import * as unbs from "../../src";
// tslint:disable-next-line:no-duplicate-imports
import { Component, RefObject } from "../../src";
import Compute from "./Compute";
import Container, { ImageId } from "./Container";

export interface Props {
    mongoHostname: string;
    mongoPort: number;
    host: RefObject<Compute>;

    name?: string;
    ctrPort?: number;
    port?: number;
    image?: ImageId;
}

export default class MongoContainer extends Component<Props> {
    static defaultProps = {
        name: "nodecellar",
        ctrPort: 8080,
        port: 8080,
        image: {
            repository: "uric/nodecellar"
        }
    };

    build() {
        const {
            mongoHostname,
            mongoPort,
            host,
            name,
            ctrPort,
            port,
            image,
        } = this.props;

        return (
            <Container
                name={name!}
                host={host}
                image={image!}
                ports={[ ctrPort! ]}
                stdinOpen={true}
                tty={true}
                command="nodejs server.js"
                environment={{
                    NODECELLAR_PORT: ctrPort!.toString(),
                    MONGO_PORT: mongoPort.toString(),
                    MONGO_HOST: mongoHostname,
                }}
                links={{
                    mongod: mongoHostname,
                }}
                portBindings={{
                    // ctr port : host port
                    [ctrPort!]: port!,
                }}
            />
        );
    }
}
