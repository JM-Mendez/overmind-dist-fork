import { IS_PROXY } from 'proxy-state-tree';
import isPlainObject from 'is-plain-obj';
export function safeValue(value) {
    if (typeof value === 'object' &&
        !Array.isArray(value) &&
        value !== null &&
        !isPlainObject(value)) {
        return `[${value.constructor.name || 'NOT SERIALIZABLE'}]`;
    }
    return value && !value[IS_PROXY] && isPlainObject(value)
        ? Object.keys(value).reduce((aggr, key) => {
            aggr[key] = safeValue(value[key]);
            return aggr;
        }, {})
        : value;
}
export function safeValues(values) {
    return values.map(safeValue);
}
const throttle = (func, limit) => {
    let lastFunc;
    let lastRan;
    return function () {
        const context = this;
        const args = arguments;
        if (!lastRan) {
            func.apply(context, args);
            lastRan = Date.now();
        }
        else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(function () {
                if (Date.now() - lastRan >= limit) {
                    func.apply(context, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };
};
export class Devtools {
    constructor(name) {
        this.buffer = [];
        this.isConnected = false;
        this.doReconnect = false;
        this.hasWarnedReconnect = false;
        this.reconnectInterval = 10000;
        this.connect = (host, onMessage) => {
            host = host || 'localhost:3031';
            this.ws = new WebSocket(`ws://${host}`);
            this.ws.onmessage = (event) => onMessage(JSON.parse(event.data));
            this.ws.onopen = () => {
                this.isConnected = true;
                this.sendBuffer();
            };
            this.ws.onerror = () => { };
            this.ws.onclose = () => {
                this.isConnected = false;
                if (this.doReconnect && !this.hasWarnedReconnect) {
                    console.warn('Debugger application is not running on selected port... will reconnect automatically behind the scenes');
                    this.hasWarnedReconnect = true;
                }
                if (this.doReconnect) {
                    this.reconnect(host, onMessage);
                }
            };
        };
        this.sendBuffer = throttle(function () {
            if (this.isConnected && this.buffer.length) {
                this.ws.send(`{ "appName": "${this.name}", "messages": [${this.buffer.join(',')}] }`);
                this.buffer.length = 0;
            }
        }, 50);
        this.name = name;
    }
    reconnect(host, onMessage) {
        setTimeout(() => this.connect(host, onMessage), this.reconnectInterval);
    }
    send(message) {
        const stringifiedMessage = JSON.stringify(message);
        (window['__zone_symbol__setTimeout'] || setTimeout)(() => {
            this.buffer.push(stringifiedMessage);
            this.sendBuffer();
        });
    }
}
//# sourceMappingURL=Devtools.js.map