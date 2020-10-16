import { Service, ServiceProps } from "@adpt/cloud";
import { BuildKitImage, LocalDockerImage, LocalDockerImageProps, ServiceContainerSet } from "@adpt/cloud/docker";
import { HttpServer, HttpServerProps, UrlRouter, UrlRouterProps } from "@adpt/cloud/http";
import { makeClusterInfo, ServiceDeployment } from "@adpt/cloud/k8s";
import * as nginx from "@adpt/cloud/nginx";
import { Postgres, TestPostgres } from "@adpt/cloud/postgres";
import Adapt, { concatStyles, Style } from "@adpt/core";
import { ProdPostgres } from "./postgres";

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
export async function k8sTestStyle() {
    const config = await makeClusterInfo({});
    return concatStyles(commonStyle,
        <Style>
            {Postgres}
            {Adapt.rule(() => <TestPostgres mockDbName="test_db" mockDataPath="./test_db.sql" />)}

            {Service}
            {Adapt.rule<ServiceProps>(({ handle, ...props }) =>
                <ServiceDeployment config={config} {...props} {...demoProps} />)}
        </Style>
    );
}

/*
 * Laptop testing style
 */
export const laptopStyle = concatStyles(commonStyle,
    <Style>
        {Postgres}
        {Adapt.rule(() => <TestPostgres mockDbName="test_db" mockDataPath="./test_db.sql" />)}

        {Service}
        {Adapt.rule<ServiceProps>(({ handle, ...props }) =>
            <ServiceContainerSet dockerHost={process.env.DOCKER_HOST} {...props} />)}
    </Style>);

/*
 * Laptop style with BuildKitImage
 */
export function laptopBkStyle() {
    const registry = process.env.BUILDKIT_REGISTRY;
    if (!registry) throw new Error(`Environment variable BUILDKIT_REGISTRY must be set for buildkit style`);
    const output = {
        type: "registry" as const,
        registry,
    };
    return concatStyles(laptopStyle,
        <Style>
            {LocalDockerImage}
            {Adapt.rule<LocalDockerImageProps>(({ handle, options = {}, ...props }) =>
                <BuildKitImage  {...props}
                    options={{ ...options, buildKitHost: process.env.BUILDKIT_HOST }}
                    output={{ imageName: "temp", ...options, ...output }}
                />
            )}

        </Style>);
}

/*
 * Production style
 */
export async function k8sProdStyle() {
    const config = await makeClusterInfo({});
    return concatStyles(commonStyle,
        <Style>
            {Postgres}
            {Adapt.rule(() => <ProdPostgres />)}

            {Service}
            {Adapt.rule<ServiceProps>(({ handle, ...props }) =>
                <ServiceDeployment config={config} {...props} />)}
        </Style>);
}
