import unbs, { Component } from "../../src";
import Compute from "../../ulib/Compute";
import DockerHost from "../../ulib/DockerHost";
import NodecellarContainer from "./AppContainer";
import MongoContainer from "./MongoContainer";

export interface Props {
    webPort?: number;
    webStatusPort?: 8081;
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
            <Compute>
                <DockerHost />

                <MongoContainer
                    name={props.mongoHostname}
                    mongoPort={props.mongoPort}
                    webStatusPort={props.webStatusPort}
                    dockerHost={props.dockerHost!}
                />

                <NodecellarContainer
                    port={props.webPort!}
                    mongoHostname={props.mongoHostname!}
                    mongoPort={props.mongoPort!}
                    dockerHost={props.dockerHost!}
                />
            </Compute>
        );
    }
}
