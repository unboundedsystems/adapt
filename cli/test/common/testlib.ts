export const newDeployRegex = /Deployment created successfully. DeployID is: (.*)$/m;

export function getNewDeployID(stdout: string) {
    let deployID: string | undefined;
    const matches = stdout.match(newDeployRegex);
    if (Array.isArray(matches) && matches[1]) deployID = matches[1];
    if (!deployID) throw new Error(`Cannot find DeployID in output`);
    return deployID;
}
