import Adapt, { concatStyles, Style } from "@usys/adapt";
import { Service, ServiceProps } from "@usys/cloud";
import { HttpServer, HttpServerProps, UrlRouter, UrlRouterProps } from "@usys/cloud/http";
import { ServiceDeployment } from "@usys/cloud/k8s";
import * as nginx from "@usys/cloud/nginx";
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

/*
 * Style rules common to all style sheets
 */
export const commonStyle =
    <Style>
        {HttpServer} {Adapt.rule<HttpServerProps>(({ handle, ...props }) =>
            <nginx.HttpServer {...props} />)}

        {UrlRouter} {Adapt.rule<UrlRouterProps>(({ handle, ...props }) =>
            <nginx.UrlRouter {...props} />)}
    </Style>;

/*
 * Kubernetes testing style
 */
export const k8sStyle = concatStyles(commonStyle,
    <Style>
        {Postgres} {Adapt.rule(() =>
            <TestPostgres mockDbName="test_db" mockDataPath="./test_db.sql" />)}

        {Service} {Adapt.rule<ServiceProps>(({ handle, ...props }) =>
            <ServiceDeployment config={kubeconfig()} {...props} {...demoProps} />)}
    </Style>);

/*
 * Laptop testing style
 */
export const laptopStyle = concatStyles(commonStyle,
    <Style>
        {Postgres} {Adapt.rule(() =>
            <TestPostgres mockDbName="test_db" mockDataPath="./test_db.sql" />)}
    </Style>);

/*
 * Production style
 */
export const prodStyle = concatStyles(commonStyle,
    <Style>
        {Postgres} {Adapt.rule(() =>
            <ProdPostgres />)}

        {Service} {Adapt.rule<ServiceProps>(({ handle, ...props }) =>
            <ServiceDeployment config={kubeconfig()} {...props} />)}
    </Style>);
