import { BuildNotImplemented } from "./index";
import {
    Component,
    ComponentType,
    UnbsElementOrNull,
} from "./jsx";

import * as ld from "lodash";

export interface ProviderProps<T> {
    value: T;
    children: UnbsElementOrNull; // Must be single child
}

export interface ConsumerProps<T> {
    children: (value: T) => UnbsElementOrNull;
}

export type Provider<T> = ComponentType<ProviderProps<T>>;
export type Consumer<T> = ComponentType<ConsumerProps<T>>;

export interface Context<T> {
    Provider: Provider<T>;
    Consumer: Consumer<T>;
}

export function createContext<T>(defaultValue: T): Context<T> {
    const stack: Provider[] = []; // class Provider

    function providerPush(provider: Provider) {
        stack.push(provider);
    }
    function providerPop() {
        stack.pop();
    }
    function currentVal(): T {
        if (stack.length > 0) {
            return stack[stack.length - 1].props.value;
        }
        return defaultValue;
    }

    // tslint:disable-next-line:no-shadowed-variable
    class Provider extends Component<ProviderProps<T>> {
        build(): UnbsElementOrNull {
            const { children } = this.props;
            if ((children == null) || Array.isArray(children)) {
                throw new BuildNotImplemented(`A context Provider may only have a single child`);
            }
            providerPush(this);

            return children;
        }
        cleanup = () => providerPop();
    }

    // tslint:disable-next-line:no-shadowed-variable
    class Consumer extends Component<ConsumerProps<T>> {
        build() {
            const { children } = this.props;
            if ((children == null) || Array.isArray(children) || !ld.isFunction(children)) {
                throw new BuildNotImplemented(`Children of a context Consumer must be a single function`);
            }
            return this.props.children(currentVal());
        }
    }

    return {
        Provider,
        Consumer,
    };
}
