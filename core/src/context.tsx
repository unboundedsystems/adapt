import { BuildNotImplemented } from "./index";
import {
    AdaptElementOrNull,
    cloneElement,
    Component,
    ComponentType,
    isElement,
} from "./jsx";
import { isDefaultKey } from "./keys";

import * as ld from "lodash";

export interface ProviderProps<T> {
    value: T;
    children: AdaptElementOrNull; // Must be single child
}

export interface ConsumerProps<T> {
    children: (value: T) => AdaptElementOrNull;
}

export type Provider<T> = ComponentType<ProviderProps<T>>;
export type Consumer<T> = ComponentType<ConsumerProps<T>>;

export interface Context<T> {
    Provider: Provider<T>;
    Consumer: Consumer<T>;
}

interface ContextImpl<T> extends Context<T> {
    currentVal(): T;
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
        build(): AdaptElementOrNull {
            const { children: child, key } = this.props;
            if ((child == null) || Array.isArray(child) || !isElement(child)) {
                throw new BuildNotImplemented(
                    `A context Provider may only have a single child, which ` +
                    `must be a Component or SFC`);
            }
            providerPush(this);

            // If there was an explicit key set (i.e. not default), propagate
            // our key to our child, but don't overwrite any key
            // already on the child props.
            if (!key || isDefaultKey(this.props) || "key" in child.props) return child;

            const { children, handle, ...childProps } = child.props;
            return cloneElement(child, { key, ...childProps }, children);
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

    const ret: ContextImpl<T> = {
        Provider,
        Consumer,
        currentVal: () => currentVal()
    };

    return ret;
}

function isContextImpl<T>(context: Context<T>): context is ContextImpl<T> {
    return ("currentVal" in context);
}

export function useContext<T>(context: Context<T>): T {
    if (!isContextImpl(context)) throw new Error("useContext context not a ContextImpl");
    return context.currentVal();
}
