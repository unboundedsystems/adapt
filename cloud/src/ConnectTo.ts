import { Environment } from "./Container";

/**
 * Components that provide a service, such as a database service or API
 * service, can implement this interface in order to supply all the information
 * required to connect to the service.
 *
 * @remarks
 * Currently, the only method supported for providing connection information
 * is via environment variables. However, additional formats for providing
 * connection information will be added as needs arise.
 * @public
 */
export interface ConnectToInstance {
    /**
     * Supplies the set of environment variables that have all the information
     * needed for a consumer of a service to connect to the provider.
     *
     * @remarks
     * This may include information like network hostname(s), port(s),
     * credentials, namespace, or any other service-specific information.
     *
     * In cases where the service has not been deployed yet or the
     * connection information is not yet available for any reason, the
     * method will return `undefined`.
     *
     * Providers are discouraged from using environment variable names
     * that are too generic or are likely to conflict with other environment
     * variables that may already be in use. For example, avoid names like
     * `HOST` and `USERNAME`. Instead, use names that are likely to be
     * unique to the type of service so that a consumer can
     * use more than one type of service without causing naming conflicts.
     *
     * Providers are encouraged to use environment variable names that are
     * typically used by consumers of the service. For example, the provider
     * of a Postgres database service should use the names `PGHOST` and
     * `PGUSER`, which are defined in the Postgres documentation and
     * are typically supported by most Postgres database clients.
     *
     * Providers should never return partial information. Return `undefined`
     * until all required connection information is available.
     */
    connectEnv(): Environment | undefined;
}
