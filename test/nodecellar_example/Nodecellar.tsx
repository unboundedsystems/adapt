import * as unbs from "../../src";
// tslint:disable-next-line:no-duplicate-imports
import { Component, createRef, Group } from "../../src";
import Compute from "./Compute";
import MongoContainer from "./MongoContainer";
import NodecellarContainer from "./NodecellarContainer";

export interface Props {
    webPort?: number;
    webStatusPort?: 8081;
    mongoHostname?: string;
    mongoPort?: number;
}

export default class Nodecellar extends Component<Props> {
    static defaultProps = {
        webPort: 8080,
        webStatusPort: 8081,
        mongoHostname: "mongo",
        mongoPort: 27017,
    };
    computeRef = createRef<Compute>();

    build() {
        const { webPort, webStatusPort, mongoHostname, mongoPort } = this.props;

        return (
            <Group>
                <Compute ref={this.computeRef} ip="127.0.0.1" />
                <MongoContainer
                    name={mongoHostname}
                    mongoPort={mongoPort}
                    webStatusPort={webStatusPort}
                    host={this.computeRef}
                />

                <NodecellarContainer
                    port={webPort!}
                    mongoHostname={mongoHostname!}
                    mongoPort={mongoPort!}
                    host={this.computeRef}
                />
            </Group>
        );
    }
}
