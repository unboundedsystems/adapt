import Adapt, { Component, Group } from "@usys/adapt";
import { Compute, NetworkService } from "@usys/cloud";

import awsStyle from "./aws";
import { AppContainer, MongoContainer } from "./containers";
import k8sStyle from "./k8s";
import localStyle from "./local";

interface Props {
    webPort?: number;
    webStatusPort?: number;
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
            <Group>
                <NetworkService port={props.webPort} />
                <NetworkService port={props.webStatusPort} />
                <Compute>

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
            </Group>
        );
    }
}

const app = <Nodecellar />;

Adapt.stack("dev", app, localStyle);
Adapt.stack("aws", app, awsStyle);
Adapt.stack("k8s", app, k8sStyle);
