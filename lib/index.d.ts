import { EventEmitter } from 'betsy';
import { IMutation, IMutationCallback } from 'proxy-state-tree';
import { Devtools } from './Devtools';
import { Events, Options, ResolveActions, ResolveState, ResolveMockActions, NestedPartial } from './internalTypes';
import { Configuration, IAction, IDerive, IOperator, TValueContext, IOnInitialize, TStateObject } from './types';
export * from './types';
/** This type can be overwriten by app developers if they want to avoid
 * typing and then they can import `Action`,  `Operation` etc. directly from
 * overmind.
 */
export interface Config {
}
export interface Action<Value = void> extends IAction<Config, Value> {
}
export interface Derive<Parent extends TStateObject, Value> extends IDerive<Config, Parent, Value> {
}
export interface OnInitialize extends IOnInitialize<Config> {
}
export declare const makeStringifySafeMutations: (mutations: IMutation[]) => {
    args: any;
    method: string;
    path: string;
}[];
export declare function createOvermindMock<Config extends Configuration>(config: Config, mockedEffects?: NestedPartial<Config['effects']>): {
    actions: ResolveMockActions<Config['actions']>;
    state: ResolveState<Config['state']>;
};
export declare class Overmind<Config extends Configuration> implements Configuration {
    private proxyStateTree;
    private actionReferences;
    private nextExecutionId;
    private options;
    initialized: Promise<any>;
    eventHub: EventEmitter<Events>;
    devtools: Devtools;
    actions: ResolveActions<Config['actions']>;
    state: ResolveState<Config['state']>;
    effects: Config['effects'] & {};
    constructor(configuration: Config, options?: Options);
    private createExecution;
    private createContext;
    private scopeValue;
    private createAction;
    private trackEffects;
    private initializeDevtools;
    private getState;
    private processState;
    private getActions;
    getTrackStateTree(): import("proxy-state-tree").ITrackStateTree<object>;
    getMutationTree(): import("proxy-state-tree").IMutationTree<object>;
    addMutationListener: (cb: IMutationCallback) => () => IMutationCallback[];
}
export declare type Operator<Input = void, Output = Input> = IOperator<Config, Input, Output>;
export declare function pipe<ThisConfig extends Configuration, A, B>(aOperator: IOperator<ThisConfig, A, B>): IOperator<ThisConfig, A, B>;
export declare function pipe<ThisConfig extends Configuration, A, B, C>(aOperator: IOperator<ThisConfig, A, B>, bOperator: IOperator<ThisConfig, B, C>): IOperator<ThisConfig, A, C>;
export declare function pipe<ThisConfig extends Configuration, A, B, C, D>(aOperator: IOperator<ThisConfig, A, B>, bOperator: IOperator<ThisConfig, B, C>, cOperator: IOperator<ThisConfig, C, D>): IOperator<ThisConfig, A, D>;
export declare function pipe<ThisConfig extends Configuration, A, B, C, D, E>(aOperator: IOperator<ThisConfig, A, B>, bOperator: IOperator<ThisConfig, B, C>, cOperator: IOperator<ThisConfig, C, D>, dOperator: IOperator<ThisConfig, D, E>): IOperator<ThisConfig, A, E>;
export declare function pipe<ThisConfig extends Configuration, A, B, C, D, E, F>(aOperator: IOperator<ThisConfig, A, B>, bOperator: IOperator<ThisConfig, B, C>, cOperator: IOperator<ThisConfig, C, D>, dOperator: IOperator<ThisConfig, D, E>, eOperator: IOperator<ThisConfig, E, F>): IOperator<ThisConfig, A, F>;
export declare function pipe<ThisConfig extends Configuration, A, B, C, D, E, F, G>(aOperator: IOperator<ThisConfig, A, B>, bOperator: IOperator<ThisConfig, B, C>, cOperator: IOperator<ThisConfig, C, D>, dOperator: IOperator<ThisConfig, D, E>, eOperator: IOperator<ThisConfig, E, F>, fOperator: IOperator<ThisConfig, F, G>): IOperator<ThisConfig, A, G>;
export declare function map<Input, Output, ThisConfig extends Configuration = Config>(operation: (input: TValueContext<ThisConfig, Input>) => Output): IOperator<ThisConfig, Input, Output extends Promise<infer U> ? U : Output>;
export declare function forEach<Input extends any[], ThisConfig extends Configuration = Config>(forEachItemOperator: IOperator<ThisConfig, Input[0], any>): IOperator<ThisConfig, Input, Input>;
export declare function parallel<Input, ThisConfig extends Configuration = Config>(...operators: IOperator<ThisConfig, Input>[]): IOperator<ThisConfig, Input, Input>;
export declare function filter<Input, ThisConfig extends Configuration = Config>(operation: (input: TValueContext<ThisConfig, Input>) => boolean): IOperator<ThisConfig, Input, Input>;
export declare function action<Input, ThisConfig extends Configuration = Config>(operation: (input: TValueContext<ThisConfig, Input>) => void): IOperator<ThisConfig, Input, Input>;
export declare function fork<Input, Paths extends {
    [key: string]: IOperator<ThisConfig, Input, any>;
}, ThisConfig extends Configuration = Config>(operation: (input: TValueContext<ThisConfig, Input>) => keyof Paths, paths: Paths): IOperator<ThisConfig, Input, Input>;
export declare function when<Input, OutputA, OutputB, ThisConfig extends Configuration = Config>(operation: (input: TValueContext<ThisConfig, Input>) => boolean, paths: {
    true: IOperator<ThisConfig, Input, OutputA>;
    false: IOperator<ThisConfig, Input, OutputB>;
}): IOperator<ThisConfig, Input, OutputA | OutputB>;
export declare function wait<Input, ThisConfig extends Configuration = Config>(ms: number): IOperator<ThisConfig, Input, Input>;
export declare function debounce<Input, ThisConfig extends Configuration = Config>(ms: number): IOperator<ThisConfig, Input, Input>;
