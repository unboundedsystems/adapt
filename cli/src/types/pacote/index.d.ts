declare module "pacote" {
    interface Options {
        cache?: string;
        cacheUid?: any;
        cacheGid?: any;
        integrity?: any;
        uid?: any;
        gid?: any;
        scope?: any;
        registry?: any;
        auth?: any;
        log?: any;
        maxSockets?: any;
    }

    interface Dependencies {
        [packageName: string]: string;
    }

    interface Bins {
        [binName: string]: string;
    }

    interface Manifest {
        name: string;
        version: string;
        dependencies: Dependencies;
        optionalDependencies: Dependencies;
        devDependencies: Dependencies;
        peerDependencies: Dependencies;
        bundleDependencies: false | Dependencies;
        bin: Bins | null;
        _resolved: any;
        _integrity: any;
        _shrinkwrap: any;
        _id: string;
        cpu: any;
        deprecated: boolean;
        engines: any;
        os: any;
    }

    function manifest(spec: string, opts?: Options): Promise<Manifest>;
}
