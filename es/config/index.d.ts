import { Configuration, IAction } from '../';
declare type SubType<Base, Condition> = Pick<Base, {
    [Key in keyof Base]: Base[Key] extends Condition ? Key : never;
}[keyof Base]>;
export declare function merge<A extends Configuration, B extends Configuration>(configA: A, configB: B): A & B;
export declare function merge<A extends Configuration, B extends Configuration, C extends Configuration>(configA: A, configB: B, configC: C): A & B & C;
export declare function merge<A extends Configuration, B extends Configuration, C extends Configuration, D extends Configuration>(configA: A, configB: B, configC: C, configD: D): A & B & C & D;
export declare function merge<A extends Configuration, B extends Configuration, C extends Configuration, D extends Configuration, E extends Configuration>(configA: A, configB: B, configC: C, configD: D, configE: E): A & B & C & D & E;
export declare function merge<A extends Configuration, B extends Configuration, C extends Configuration, D extends Configuration, E extends Configuration, F extends Configuration>(configA: A, configB: B, configC: C, configD: D, configE: E, configF: F): A & B & C & D & E & F;
export declare function merge<A extends Configuration, B extends Configuration, C extends Configuration, D extends Configuration, E extends Configuration, F extends Configuration, G extends Configuration>(configA: A, configB: B, configC: C, configD: D, configE: E, configF: F, configG: G): A & B & C & D & E & F & G;
export declare function merge<A extends Configuration, B extends Configuration, C extends Configuration, D extends Configuration, E extends Configuration, F extends Configuration, G extends Configuration, H extends Configuration>(configA: A, configB: B, configC: C, configD: D, configE: E, configF: F, configG: G, configH: H): A & B & C & D & E & F & G & H;
export declare function merge<A extends Configuration, B extends Configuration, C extends Configuration, D extends Configuration, E extends Configuration, F extends Configuration, G extends Configuration, H extends Configuration, I extends Configuration>(configA: A, configB: B, configC: C, configD: D, configE: E, configF: F, configG: G, configH: H, configI: I): A & B & C & D & E & F & G & H & I;
interface NamespacedConfiguration {
    [namespace: string]: {
        onInitialize?: any;
        state?: {};
        effects?: {};
        actions?: {};
        reactions?: {};
    };
}
export declare function namespaced<T extends NamespacedConfiguration>(namespaces: T): {
    onInitialize?: any;
    state: SubType<{
        [P in keyof T]: T[P]['state'];
    }, object>;
    effects: SubType<{
        [P in keyof T]: T[P]['effects'];
    }, object>;
    actions: SubType<{
        [P in keyof T]: T[P]['actions'];
    }, object>;
};
interface LazyConfiguration {
    [namespace: string]: () => Promise<{
        onInitialize?: any;
        state?: {};
        effects?: {};
        actions?: {};
        reactions?: {};
    }>;
}
export declare function lazy<T extends LazyConfiguration, B = T>(configurations: T): {
    onInitialize?: any;
    state: SubType<{
        [P in keyof T]?: ReturnType<T[P]> extends Promise<infer U> ? U extends {
            state: any;
        } ? U['state'] : never : never;
    }, object>;
    effects: SubType<{
        [P in keyof T]?: ReturnType<T[P]> extends Promise<infer U> ? U extends {
            effects: any;
        } ? U['effects'] : never : never;
    }, object> & {
        lazy: {
            loadConfig: (config: keyof T) => Promise<void>;
        };
    };
    actions: SubType<{
        [P in keyof T]?: ReturnType<T[P]> extends Promise<infer U> ? U extends {
            actions: any;
        } ? U['actions'] : never : never;
    }, object> & {
        lazy: {
            loadConfig: IAction<any, keyof T>;
        };
    };
};
export {};
