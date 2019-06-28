import Adapt, { handle, useImperativeMethods } from "@adpt/core";

export function ProdPostgres() {
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
