import * as tmp from 'tmp';

declare function dir(options: tmp.SimpleOptions): Promise<{ path: string, cleanup: () => void }>