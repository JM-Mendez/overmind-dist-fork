import { ResolveActions, ResolveState, TBaseContext } from './internalTypes';
import { Overmind } from './';
/** ===== PUBLIC API
 */
export { EventType } from './internalTypes';
export declare type Configuration = {
    onInitialize?: any;
    state?: {};
    effects?: {};
    actions?: {};
};
export declare type BaseApp = {
    state: {};
    effects: {};
    actions: {};
};
export declare type TStateObject = {
    [key: string]: TStateObject | string | IDerive<any, any, any> | number | boolean | object;
} | undefined;
export interface IConfig<ThisConfig extends Configuration> {
    state: ThisConfig['state'] & {};
    actions: ThisConfig['actions'] & {};
    effects: ThisConfig['effects'] & {};
}
export declare type TApp<ThisConfig extends Configuration> = {
    state: ResolveState<ThisConfig['state']>;
    actions: ResolveActions<ThisConfig['actions']>;
    effects: ThisConfig['effects'];
};
export declare type TValueContext<ThisConfig extends Configuration, Value> = TBaseContext<ThisConfig> & {
    value: Value;
};
export interface IAction<ThisConfig extends Configuration, Value> {
    (context: TValueContext<ThisConfig, Value>): any;
}
export declare type IOperator<ThisConfig extends Configuration, Input, Output = Input> = (err: Error | null, val: TValueContext<ThisConfig, Input>, next: (err: Error | null, val?: TValueContext<ThisConfig, Output>) => void, final?: (err: any, Error: any, val?: TValueContext<ThisConfig, Output>) => void) => void;
export declare type IDerive<ThisConfig extends Configuration, Parent extends TStateObject, Value> = (parent: ResolveState<Parent>, state: ResolveState<ThisConfig['state'] & {}>) => Value;
export interface IOnInitialize<ThisConfig extends Configuration> {
    (context: TValueContext<ThisConfig, Overmind<ThisConfig>>): void;
}
