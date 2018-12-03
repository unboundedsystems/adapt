import Adapt, { Component, Group } from "@usys/adapt";
import { Compute, DockerHost, NetworkService } from "@usys/cloud";

import { AppContainer, MongoContainer } from "./containers";

interface Props {
    webPort?: number;
    webStatusPort?: number;
    mongoHostname?: string;
    mongoPort?: number;
    dockerHost?: string;
}

export default class Nodecellar extends Component<Props> {
    static defaultProps = {
        webPort: 8080,
        webStatusPort: 8081,
        mongoHostname: "mongo",
        mongoPort: 27017,
    };

    build() {
        const props = this.props;

        return (
            <Group>
                <NetworkService port={props.webPort} />
                <NetworkService port={props.webStatusPort} />
                <Compute>
                    <DockerHost />

                    <MongoContainer
                        name={props.mongoHostname}
                        mongoPort={props.mongoPort}
                        webStatusPort={props.webStatusPort}
                        dockerHost={props.dockerHost}
                    />

                    <AppContainer
                        port={props.webPort}
                        mongoHostname={props.mongoHostname}
                        mongoPort={props.mongoPort}
                        dockerHost={props.dockerHost}
                    />
                </Compute>
            </Group>
        );
    }
}
