import Adapt, { handle, Sequence, useImperativeMethods, useMethod } from "@adpt/core";
import { ConnectToInstance } from "../ConnectTo";
import { Container } from "../Container";
import { ImageInfo } from "../docker";
import { NetworkService } from "../NetworkService";
import { Service } from "../Service";
import { PreloadedPostgresImage } from "./PreloadedPostgresImage";

/**
 * A component suitable for creating test scenarios that creates a simple,
 * temporary Postgres database that loads test data from a .sql file and
 * which implements the abstract {@link postgres.Postgres} interface.
 * @public
 */
export function TestPostgres(props: { mockDataPath: string, mockDbName: string }) {
    const dbCtr = handle();
    const svc = handle();
    const svcHostname = useMethod<string | undefined>(svc, undefined, "hostname");

    useImperativeMethods<ConnectToInstance>(() => ({
        connectEnv: () => {
            if (!svcHostname) return undefined;
            return [
                { name: "PGHOST", value: svcHostname },
                { name: "PGDATABASE", value: props.mockDbName },
                { name: "PGUSER", value: "postgres" },
                { name: "PGPASSWORD", value: "hello" }
            ];
        }
    }));

    const img = handle();
    const image = useMethod<ImageInfo | undefined>(img, undefined, "latestImage");

    return <Sequence>
        <PreloadedPostgresImage handle={img} mockDbName={props.mockDbName} mockDataPath={props.mockDataPath} />
        <Service>
            <NetworkService
                handle={svc}
                scope="cluster-internal"
                endpoint={dbCtr}
                port={5432}
            />
            {image ?
                <Container
                    name="db"
                    handle={dbCtr}
                    image={image.nameTag!}
                    environment={{ POSTGRES_PASSWORD: "hello" }}
                    imagePullPolicy="Never"
                    ports={[5432]}
                />
                : null}
        </Service>
    </Sequence>;
}
