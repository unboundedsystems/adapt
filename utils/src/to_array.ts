export const toArray = <T>(val: T | T[]): T[] => Array.isArray(val) ? val : [ val ];
