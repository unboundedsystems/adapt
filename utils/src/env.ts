/**
 * Returns true if the specified environment variable is set to anything
 * other than the following list of false-ish strings:
 *   "0"
 *   "false"
 *   "off"
 *   "no"
 * The comparison performed is case-insensitive. Note that if the
 * environment variable is set to the empty string "", this will return true.
 * @param varName The name of the environment variable to query
 */
export function getEnvAsBoolean(varName: string): boolean {
    const val = process.env[varName];
    if (val == null) return false;
    switch (val.toLowerCase()) {
        case "0":
        case "false":
        case "off":
        case "no":
            return false;
        default:
            return true;
    }
}
