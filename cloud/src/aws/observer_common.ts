import jsonStableStringify from "json-stable-stringify";
import { AwsCredentialsProps } from "./credentials";

export interface AwsQueryParams extends AwsCredentialsProps { }

export type QueryParams = AwsQueryParams;

export const infoSym = Symbol("adaptObserverInfo");
export interface QueryResolverInfo {
    [infoSym]: AwsQueryParams;
}
export type ObserveResolverInfo = QueryResolverInfo;

export interface Observations {
    [queryId: string]: any;
}

export const withParamsProp = "withCredentials";

export function computeQueryId(queryParams: QueryParams, fieldName: string, args: unknown) {
    return jsonStableStringify({
        awsRegion: queryParams.awsRegion,
        awsAccessKeyId: queryParams.awsAccessKeyId,
        fieldName, //Note(manishv) should this really be the path in case operationId changes?
        args,
    });
}

export function opName(fieldName: string) {
    return fieldName[0].toLowerCase() + fieldName.substr(1);
}
