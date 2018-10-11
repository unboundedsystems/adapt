import { Swagger2 } from "./swagger_types";

export function validateSwagger2(cand: unknown): Swagger2 {
    //FIXME(manishv) add JSON schema validator here
    return cand as Swagger2;
}
