import unbs, { Group } from "./index";
import {
    Component,
    ComponentType,
    UnbsElementOrNull,
    WithChildren,
} from "./jsx";

export interface ProviderProps<T> extends WithChildren {
    value: T;
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
    const stack: ProviderImpl[] = [];

    function providerPush(provider: ProviderImpl) {
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

    class ProviderImpl extends Component<ProviderProps<T>> {
        build(): UnbsElementOrNull {
            providerPush(this);
            return this.props.children ?
                <Group>{this.props.children}</Group> :
                null;
        }
        cleanup = () => providerPop();
    }

    class ConsumerImpl extends Component<ConsumerProps<T>> {
        build() {
            const { children } = this.props;
            if (!children ||
                !Array.isArray(children) ||
                children.length !== 1) {
                throw new Error(`Children of a context Consumer must be a single function`);
            }
            return (this.props.children as any)[0](currentVal());
        }
    }

    return {
        Provider: ProviderImpl,
        Consumer: ConsumerImpl,
    };
}
