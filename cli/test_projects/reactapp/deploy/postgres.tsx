import Adapt, { handle, useImperativeMethods } from "@usys/adapt";

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
