import * as Adapt from "@adpt/core";
import * as cloud from "@adpt/cloud";

export interface AppProps {
    mongoHostname: string;
    mongoPort: number;
    dockerHost: string;

    name: string;
    ctrPort: number;
    port: number;
    image: cloud.ImageId;
}

export class AppContainer extends Adapt.Component<AppProps, {}> {
    static defaultProps = {
        name: "nodecellar",
        ctrPort: 8080,
        port: 8080,
        image: "uric/nodecellar",
    };

    build() {
        const props = this.props;

        return (
            <cloud.Container
                name={props.name}
                autoRemove={true}
                dockerHost={props.dockerHost}
                image={props.image}
                ports={[ props.ctrPort ]}
                stdinOpen={true}
                tty={true}
                command={["nodejs", "server.js"]}
                environment={{
                    NODECELLAR_PORT: props.ctrPort.toString(),
                    MONGO_PORT: props.mongoPort.toString(),
                    MONGO_HOST: props.mongoHostname,
                }}
                links={{
                    mongod: props.mongoHostname,
                }}
                portBindings={{
                    // ctr port : host port
                    [props.ctrPort]: props.port,
                }}
            />
        );
    }
}

export interface MongoProps {
    dockerHost: string;
    name: string;
    mongoCtrPort: number;
    webStatusCtrPort: number;
    mongoPort: number;
    webStatusPort: number;
    image: cloud.ImageId;
}

export class MongoContainer extends Adapt.Component<MongoProps, {}> {
    static defaultProps = {
        name: "mongod",
        mongoCtrPort: 27017,
        webStatusCtrPort: 28017,
        mongoPort: 27017,
        webStatusPort: 28017,
        image: "mongo:3.1",
    };

    build() {
        const props = this.props;

        return (
            <cloud.Container
                name={props.name}
                autoRemove={true}
                dockerHost={props.dockerHost}
                image={props.image}
                ports={[props.mongoCtrPort, props.webStatusCtrPort]}
                stdinOpen={true}
                tty={true}
                command={["mongod", "--rest", "--httpinterface", "--smallfiles"]}
                portBindings={{
                    // ctr port : host port
                    [props.mongoCtrPort]: props.mongoPort,
                    [props.webStatusCtrPort]: props.webStatusPort
                }}
            />
        );
    }
}
