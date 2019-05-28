import Adapt, { Style, } from "@usys/adapt";
import { Service, ServiceProps } from "@usys/cloud";
import { ServiceDeployment } from "@usys/cloud/k8s";
import { Postgres, TestPostgres } from "@usys/cloud/postgres";
import { ProdPostgres } from "./postgres";

export function kubeconfig() {
    // tslint:disable-next-line:no-var-requires
    return require("./kubeconfig.json");
}

// Terminate containers quickly for demos
const demoProps = {
    podProps: { terminationGracePeriodSeconds: 0 }
};

export const prodStyle =
    <Style>
        {Postgres} {Adapt.rule(() =>
            <ProdPostgres />)}

        {Service} {Adapt.rule<ServiceProps>(({ handle, ...props }) =>
            <ServiceDeployment config={kubeconfig()} {...props} />)}
    </Style>;

export const laptopStyle =
    <Style>
        {Postgres}
            {Adapt.rule(() => <TestPostgres mockDbName="test_db" mockDataPath="./test_db.sql" />)}
    </Style>;

export const k8sStyle =
    <Style>
        {Postgres} {Adapt.rule(() =>
            <TestPostgres mockDbName="test_db" mockDataPath="./test_db.sql" />)}

        {Service} {Adapt.rule<ServiceProps>(({ handle, ...props }) =>
            <ServiceDeployment config={kubeconfig()} {...props} {...demoProps} />)}
    </Style>;
