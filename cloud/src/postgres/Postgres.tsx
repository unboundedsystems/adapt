import { useImperativeMethods } from "@adpt/core";
import { Environment } from "../Container";

/**
 * An abstract component representing a Postgres database within a Postgres
 * server or service.
 *
 * @remarks
 * Instance methods:
 *
 * - connectEnv(): Environment | undefined
 *
 *   Returns the set of environment variables that have all the information
 *   needed for a Postgres client to connect to this database. The
 *   returned environment variables are named such that some common Postgres
 *   clients can use them directly:
 *
 *   `PGHOST`: The host to connect to.
 *
 *   `PGDATABASE`: The name of the database.
 *
 *   `PGUSER`: Username to use to authenticate to the database server or service.
 *
 *   `PGPASSWORD`: Password to use to authenticate to the database server or service.
 *
 * @public
 */
export function Postgres() {
    useImperativeMethods(() => ({
        connectEnv: (): Environment | undefined => undefined
    }));
    return null;
}
