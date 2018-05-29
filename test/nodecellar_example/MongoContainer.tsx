import * as unbs from "../../src";
// tslint:disable-next-line:no-duplicate-imports
import { Component, RefObject } from "../../src";
import Compute from "./Compute";
import Container, { ImageId } from "./Container";

export interface Props {
    host: RefObject<Compute>;
    name?: string;
    mongoCtrPort?: number;
    webStatusCtrPort?: number;
    mongoPort?: number;
    webStatusPort?: number;
    image?: ImageId;
}

export default class MongoContainer extends Component<Props> {
    static defaultProps = {
        name: "mongod",
        mongoCtrPort: 27017,
        webStatusCtrPort: 28017,
        mongoPort: 27017,
        webStatusPort: 28017,
        image: {
            repository: "mongo",
            tag: "3.1",
        }
    };

    build() {
        const {
            host,
            name,
            mongoCtrPort,
            webStatusCtrPort,
            mongoPort,
            webStatusPort,
            image
        } = this.props;

        return (
            <Container
                name={name!}
                host={host}
                image={image!}
                ports={[mongoCtrPort!, webStatusCtrPort!]}
                stdinOpen={true}
                tty={true}
                command="mongod --rest --httpinterface --smallfiles"
                portBindings={{
                    // ctr port : host port
                    [mongoCtrPort!]: mongoPort!,
                    [webStatusCtrPort!]: webStatusPort!
                }}
            />
        );
    }
}
