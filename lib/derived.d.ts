import { EventEmitter } from 'betsy';
import { ProxyStateTree } from 'proxy-state-tree';
import { Events } from './internalTypes';
export declare class Derived {
    private cb;
    private isDirty;
    private trackStateTree;
    private scope;
    private value;
    private paths;
    private updateCount;
    constructor(cb: (state: object, parent: object) => void);
    evaluate(eventHub: EventEmitter<Events>, proxyStateTree: ProxyStateTree<any>, path: any): any;
}
