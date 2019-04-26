import Adapt, {
    DeployedWhenMethod,
    FinalDomElement,
    Handle,
    isFinalDomElement,
    PrimitiveComponent,
    SFCDeclProps,
    useContext,
    waiting
} from "@usys/adapt";
import { CFStackContext } from "./stack_context";

export interface AnyProperties {
    [ propName: string ]: any;
}

export interface CFResourceProps {
    Type: string;
    Properties: AnyProperties;
    cfStackHandle?: Handle;
    children?: any;
    /**
     * Set to true if CloudFormation or the underlying AWS resource does not
     * support tagging
     */
    tagsUnsupported?: boolean;
}

export class CFResourcePrimitive extends PrimitiveComponent<CFResourceProps> {
    deployedWhen: DeployedWhenMethod = async (goalStatus, helpers) => {
        const hand = this.props.cfStackHandle;
        if (!hand) {
            throw new Error(`CFResource must have a valid Handle ` +
                `to its corresponding CFStack in props.cfStackHandle`);
        }
        if (!hand.target) {
            throw new Error(`CFResource props.cfStackHandle does not ` +
                `reference a valid Element`);
        }
        if (helpers.isDeployed(hand)) return true;
        return waiting(`Waiting for CFStack to be ${goalStatus.toLowerCase()}`);
    }
}

export function isCFResourcePrimitiveElement(val: any): val is FinalDomElement<CFResourceProps> {
    return isFinalDomElement(val) && val.componentType === CFResourcePrimitive;
}

export function CFResource(props: SFCDeclProps<CFResourceProps>) {
    const { handle: _h, cfStackHandle, ...rest } = props;
    // Always call hook
    let stackHand = useContext(CFStackContext);
    if (cfStackHandle) stackHand = cfStackHandle;
    return <CFResourcePrimitive cfStackHandle={stackHand} {...rest} />;
}
