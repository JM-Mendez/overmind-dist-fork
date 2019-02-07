export declare type Message = {
    type: string;
    data?: object;
};
export declare function safeValue(value: any): any;
export declare function safeValues(values: any): any;
export declare class Devtools {
    private buffer;
    private ws;
    private isConnected;
    private doReconnect;
    private hasWarnedReconnect;
    private reconnectInterval;
    private name;
    constructor(name: string);
    connect: (host: string, onMessage: (message: Message) => void) => void;
    private reconnect;
    send(message: Message): void;
    private sendBuffer;
}
