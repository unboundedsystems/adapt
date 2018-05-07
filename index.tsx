declare namespace unbs {
    namespace JSX {
        interface IntrinsicElements {
            test: object;
        }
    }
}

namespace unbs {
    function createElement(...x: any[]) { return {}; };
}

<test></test>