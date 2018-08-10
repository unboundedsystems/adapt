export enum MessageType {
    warning = "warning",
    error = "error",
}
export interface Message {
    type: MessageType;
    content: string;
}

export function messagesToString(msgs: Message[]): string {
    return msgs.map((m) => messageToString(m)).join("\n");
}

export function messageToString(msg: Message): string {
    return `${msg.type}: ${msg.content}`;
}
