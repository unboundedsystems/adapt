import {
    _getGen,
    Gen,
    matchDeps,
    validateGenList,
} from "./gen";
import { Project } from "./project";

const gen0: Gen = {
    name: "gen0",
    match: matchDeps,
    dependencies: {
        "@adpt/core": { allowed: "*", preferred: "*" },
        "@types/node": { allowed: "^8", preferred: "^8"},
        "source-map-support": { allowed: "^0.5.6", preferred: "^0.5.6" },
        "typescript": { allowed: ">=3.0", preferred: "^3.0.3" },
    },
};

const genList: Gen[] = [
    gen0,
];
validateGenList(genList);

export function getGen(proj: Project) {
    return _getGen(proj, genList);
}
