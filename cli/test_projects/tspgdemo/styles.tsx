import Adapt, { Group, handle, Style, useImperativeMethods } from "@adpt/core";
import { useMethod } from "@adpt/cloud";
import { K8sContainer, Pod, Service } from "@adpt/cloud/k8s";
import { Postgres, usePreloadedPostgres } from "./lib";
import { kubeconfig } from "./TypeScriptService";

export const prodStyle =
    <Style>
        {Group} {Postgres} {Adapt.rule(() => <ProdPostgres />)}
    </Style>;

export const localStyle =
    <Style>
        {Group}[key="App"] {Postgres}
            {Adapt.rule(() => <TestPostgres mockDbName="test_db" mockDataPath="./test_db.sql" />)}
    </Style>;

function TestPostgres(props: { mockDataPath: string, mockDbName: string }) {
    const pod = handle();
    const svc = handle();
    const svcHostname = useMethod(svc, undefined, "hostname");
    const { image, buildObj } = usePreloadedPostgres(props.mockDbName, props.mockDataPath);

    useImperativeMethods(() => ({
        connectEnv: () => {
            if (svcHostname) {
                return [
                    { name: "PGHOST", value: svcHostname },
                    { name: "PGDATABASE", value: props.mockDbName },
                    { name: "PGUSER", value: "postgres" },
                    { name: "PGPASSWORD", value: "hello" }
                ];
            }
            return undefined;
        }
    }));

    return <Group>
        {buildObj}
        <Service
            config={kubeconfig()}
            handle={svc}
            type="ClusterIP"
            selector={pod}
            ports={[{ port: 5432, targetPort: 5432 }]}
        />
        {image ?
            <Pod handle={pod} config={kubeconfig()}>
                <K8sContainer
                    name="db"
                    image={image.nameTag!}
                    env={[{ name: "POSTGRES_PASSWORD", value: "hello" }]}
                    imagePullPolicy="Never"
                />
            </Pod>
            : null}
    </Group>;
}

function ProdPostgres() {
    useImperativeMethods(() => ({
        connectEnv: () => ([
            { name: "PGHOST", value: "postgres_db" },
            { name: "PGUSER", value: "postgres" },
            {
                name: "PGPASSWORD",
                valueFrom: {
                    secretKeyRef: {
                        name: "postgres_password",
                        key: "password"
                    }
                }
            }
        ])
    }));
    return null;
}
