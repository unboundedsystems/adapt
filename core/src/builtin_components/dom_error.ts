import { AdaptElement, PrimitiveComponent } from "../jsx";

export interface DomErrorProps {
    children: string;
}
export class DomError extends PrimitiveComponent<DomErrorProps> { }

export function isDomErrorElement(element: AdaptElement): element is AdaptElement<DomErrorProps> {
    return element.componentType === DomError;
}
