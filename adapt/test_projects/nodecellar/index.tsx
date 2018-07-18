import Adapt, { Component } from "@usys/adapt";
import { Compute, DockerHost } from "@usys/cloud";

import { AppContainer, MongoContainer } from "./containers";
import { awsStyle, localStyle } from "./styles";

interface Props {
    webPort?: number;
    webStatusPort?: 8081;
    mongoHostname?: string;
    mongoPort?: number;
    dockerHost?: string;
}

class Nodecellar extends Component<Props, {}> {
    static defaultProps = {
        webPort: 8080,
        webStatusPort: 8081,
        mongoHostname: "mongo",
        mongoPort: 27017,
    };

    build() {
        const props = this.props;

        return (
            <Compute>
                <DockerHost />

                <MongoContainer
                    name={props.mongoHostname}
                    mongoPort={props.mongoPort}
                    webStatusPort={props.webStatusPort}
                    dockerHost={props.dockerHost!}
                />

                <AppContainer
                    port={props.webPort!}
                    mongoHostname={props.mongoHostname!}
                    mongoPort={props.mongoPort!}
                    dockerHost={props.dockerHost!}
                />
            </Compute>
        );
    }
}

const app = <Nodecellar />;

Adapt.stack("dev", app, localStyle);
Adapt.stack("aws", app, awsStyle);
