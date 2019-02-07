"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const betsy_1 = require("betsy");
const is_plain_obj_1 = tslib_1.__importDefault(require("is-plain-obj"));
const proxy_state_tree_1 = require("proxy-state-tree");
const derived_1 = require("./derived");
const Devtools_1 = require("./Devtools");
const internalTypes_1 = require("./internalTypes");
const proxyfyEffects_1 = require("./proxyfyEffects");
tslib_1.__exportStar(require("./types"), exports);
const IS_NODE = typeof module !== 'undefined' && (!this || this.module !== module);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
const IS_OPERATOR = Symbol('operator');
exports.makeStringifySafeMutations = (mutations) => {
    return mutations.map((mutation) => (Object.assign({}, mutation, { args: Devtools_1.safeValues(mutation.args) })));
};
function deepCopy(obj) {
    if (is_plain_obj_1.default(obj)) {
        return Object.keys(obj).reduce((aggr, key) => {
            aggr[key] = deepCopy(obj[key]);
            return aggr;
        }, {});
    }
    else if (Array.isArray(obj)) {
        return obj.map((item) => deepCopy(item));
    }
    return obj;
}
function createOvermindMock(config, mockedEffects) {
    const mock = new Overmind(Object.assign({}, config, {
        state: deepCopy(config.state),
    }), {
        devtools: false,
        testMode: {
            effectsCallback: (effect) => {
                const mockedEffect = (effect.name
                    ? effect.name.split('.')
                    : []).reduce((aggr, key) => (aggr ? aggr[key] : aggr), mockedEffects);
                if (!mockedEffect || (mockedEffect && !mockedEffect[effect.method])) {
                    throw new Error(`The effect "${effect.name}" with metod ${effect.method} has not been mocked`);
                }
                return mockedEffect[effect.method]({
                    path: effect.name + '.' + effect.method,
                    args: effect.args,
                });
            },
            actionCallback: (execution) => {
                return execution.flush().mutations;
            },
        },
    });
    return {
        actions: mock.actions,
        state: mock.state,
    };
}
exports.createOvermindMock = createOvermindMock;
const hotReloadingCache = {};
// We do not use TConfig<Config> directly to type the class in order to avoid
// the 'import(...)' function to be used in exported types.
class Overmind {
    constructor(configuration, options = {}) {
        this.actionReferences = [];
        this.nextExecutionId = 0;
        this.addMutationListener = (cb) => {
            return this.proxyStateTree.onMutation(cb);
        };
        const name = options.name || 'MyConfig';
        if (IS_DEVELOPMENT) {
            if (hotReloadingCache[name]) {
                return hotReloadingCache[name];
            }
            else {
                hotReloadingCache[name] = this;
            }
        }
        /*
          Set up an eventHub to trigger information from derived, computed and reactions
        */
        const eventHub = new betsy_1.EventEmitter();
        /*
          Create the proxy state tree instance with the state and a wrapper to expose
          the eventHub
        */
        const proxyStateTree = new proxy_state_tree_1.ProxyStateTree(this.getState(configuration), {
            devmode: !IS_PRODUCTION,
            dynamicWrapper: (_, path, func) => func(eventHub, proxyStateTree, path),
            onGetter: (path, value) => this.eventHub.emit(internalTypes_1.EventType.GETTER, {
                path,
                value: Devtools_1.safeValue(value),
            }),
        });
        this.state = proxyStateTree.state;
        this.effects = configuration.effects || {};
        this.proxyStateTree = proxyStateTree;
        this.eventHub = eventHub;
        this.options = options;
        if (!IS_PRODUCTION && typeof window !== 'undefined') {
            let warning = 'OVERMIND: You are running in DEVELOPMENT mode.';
            if (options.logProxies !== true) {
                const originalConsoleLog = console.log;
                console.log = (...args) => originalConsoleLog.apply(console, args.map((arg) => (arg && arg[proxy_state_tree_1.IS_PROXY] ? arg[proxy_state_tree_1.VALUE] : arg)));
                warning +=
                    '\n\n - To improve debugging experience "console.log" will NOT log proxies from Overmind, but the actual value. Please see docs to turn off this behaviour';
            }
            if (options.devtools ||
                (typeof location !== 'undefined' &&
                    location.hostname === 'localhost' &&
                    options.devtools !== false)) {
                const host = options.devtools === true ? 'localhost:3031' : options.devtools;
                const name = options.name
                    ? options.name
                    : typeof document === 'undefined'
                        ? 'NoName'
                        : document.title || 'NoName';
                this.initializeDevtools(host, name, eventHub, proxyStateTree);
            }
            else {
                warning +=
                    '\n\n - You are not running on localhost. You will have to manually define the devtools option to connect';
            }
            if (!IS_NODE) {
                console.warn(warning);
            }
        }
        if (IS_PRODUCTION) {
            eventHub.on(internalTypes_1.EventType.OPERATOR_ASYNC, () => {
                proxyStateTree.getMutationTree().flush();
            });
            eventHub.on(internalTypes_1.EventType.ACTION_END, () => {
                proxyStateTree.getMutationTree().flush();
            });
            let nextTick;
            const flushTree = () => {
                proxyStateTree.getMutationTree().flush(true);
            };
            this.proxyStateTree.onMutation(() => {
                nextTick && clearTimeout(nextTick);
                nextTick = setTimeout(flushTree, 0);
            });
        }
        else if (!options.testMode) {
            eventHub.on(internalTypes_1.EventType.OPERATOR_ASYNC, (execution) => {
                const flushData = execution.flush();
                if (this.devtools && flushData) {
                    this.devtools.send({
                        type: 'flush',
                        data: Object.assign({}, execution, flushData),
                    });
                }
            });
            eventHub.on(internalTypes_1.EventType.ACTION_END, (execution) => {
                const flushData = execution.flush();
                if (this.devtools && flushData) {
                    this.devtools.send({
                        type: 'flush',
                        data: Object.assign({}, execution, flushData),
                    });
                }
            });
        }
        /*
          Expose the created actions
        */
        this.actions = this.getActions(configuration);
        if (configuration.onInitialize) {
            const onInitialize = this.createAction('onInitialize', configuration.onInitialize, true);
            this.initialized = Promise.resolve(onInitialize(this));
        }
        else {
            this.initialized = Promise.resolve(null);
        }
    }
    createExecution(name, action) {
        if (IS_PRODUCTION) {
            return {
                getMutationTree: () => {
                    return this.proxyStateTree.getMutationTree();
                },
                emit: this.eventHub.emit.bind(this.eventHub),
            };
        }
        const mutationTrees = [];
        const execution = {
            actionId: this.actionReferences.indexOf(action),
            executionId: this.nextExecutionId++,
            actionName: name,
            operatorId: 0,
            path: [],
            emit: this.eventHub.emit.bind(this.eventHub),
            send: this.devtools ? this.devtools.send.bind(this.devtools) : () => { },
            trackEffects: this.trackEffects.bind(this, this.effects),
            flush: () => {
                return this.proxyStateTree.flush(mutationTrees);
            },
            getMutationTree: () => {
                const mutationTree = this.proxyStateTree.getMutationTree();
                mutationTrees.push(mutationTree);
                return mutationTree;
            },
            scopeValue: (value, tree) => {
                return this.scopeValue(value, tree);
            },
        };
        return execution;
    }
    createContext(value, execution, tree) {
        return {
            value,
            state: tree.state,
            actions: this.actions,
            execution,
            proxyStateTree: this.proxyStateTree,
            effects: this.trackEffects(this.effects, execution),
        };
    }
    scopeValue(value, tree) {
        if (!value) {
            return value;
        }
        if (value[proxy_state_tree_1.IS_PROXY]) {
            return this.proxyStateTree.rescope(value, tree);
        }
        else if (is_plain_obj_1.default(value)) {
            return Object.assign({}, ...Object.keys(value).map((key) => ({
                [key]: this.proxyStateTree.rescope(value[key], tree),
            })));
        }
        else {
            return value;
        }
    }
    createAction(name, action, isOnInitialize = false) {
        this.actionReferences.push(action);
        const actionFunc = (value) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (IS_PRODUCTION || action[IS_OPERATOR]) {
                return new Promise((resolve, reject) => {
                    const execution = this.createExecution(name, action);
                    this.eventHub.emit(internalTypes_1.EventType.ACTION_START, execution);
                    action[IS_OPERATOR]
                        ? action(null, {
                            value,
                            state: this.proxyStateTree.state,
                            actions: this.actions,
                            execution,
                            effects: this.trackEffects(this.effects, execution),
                        }, (err, finalContext) => {
                            finalContext &&
                                this.eventHub.emit(internalTypes_1.EventType.ACTION_END, Object.assign({}, finalContext.execution, { operatorId: finalContext.execution.operatorId - 1 }));
                            if (err)
                                reject(err);
                            else
                                resolve(this.options.testMode && finalContext.execution);
                        })
                        : resolve(action(this.createContext(value, execution, execution.getMutationTree()))
                            ? undefined
                            : undefined);
                });
            }
            else {
                const execution = Object.assign({}, this.createExecution(name, action), { operatorId: 0, type: 'action' });
                this.eventHub.emit(internalTypes_1.EventType.ACTION_START, execution);
                this.eventHub.emit(internalTypes_1.EventType.OPERATOR_START, execution);
                const mutationTree = execution.getMutationTree();
                mutationTree.onMutation((mutation) => {
                    this.eventHub.emit(internalTypes_1.EventType.MUTATIONS, Object.assign({}, execution, { mutations: exports.makeStringifySafeMutations([mutation]) }));
                    setTimeout(() => {
                        const flushData = mutationTree.flush(true);
                        if (this.devtools && flushData) {
                            this.devtools.send({
                                type: 'flush',
                                data: Object.assign({}, execution, flushData, { mutations: exports.makeStringifySafeMutations(flushData.mutations) }),
                            });
                        }
                    });
                });
                const context = this.createContext(this.scopeValue(value, mutationTree), execution, mutationTree);
                const result = isOnInitialize ? yield action(context) : action(context);
                this.eventHub.emit(internalTypes_1.EventType.OPERATOR_END, Object.assign({}, execution, { isAsync: result instanceof Promise, result: undefined }));
                this.eventHub.emit(internalTypes_1.EventType.ACTION_END, execution);
                return Promise.resolve(this.options.testMode && execution);
            }
        });
        if (this.options.testMode) {
            const actionCallback = this.options.testMode.actionCallback;
            return (value) => actionFunc(value).then(actionCallback);
        }
        return actionFunc;
    }
    trackEffects(effects = {}, execution) {
        if (IS_PRODUCTION) {
            return effects;
        }
        return proxyfyEffects_1.proxifyEffects(this.effects, (effect) => {
            let result;
            try {
                result = this.options.testMode
                    ? this.options.testMode.effectsCallback(effect)
                    : effect.func.apply(this, effect.args);
            }
            catch (error) {
                // eslint-disable-next-line standard/no-callback-literal
                this.eventHub.emit(internalTypes_1.EventType.EFFECT, Object.assign({}, execution, effect, { args: Devtools_1.safeValues(effect.args), isPending: false, error: error.message }));
                throw error;
            }
            if (result instanceof Promise) {
                // eslint-disable-next-line standard/no-callback-literal
                this.eventHub.emit(internalTypes_1.EventType.EFFECT, Object.assign({}, execution, effect, { args: Devtools_1.safeValues(effect.args), isPending: true, error: false }));
                result
                    .then((promisedResult) => {
                    // eslint-disable-next-line standard/no-callback-literal
                    this.eventHub.emit(internalTypes_1.EventType.EFFECT, Object.assign({}, execution, effect, { args: Devtools_1.safeValues(effect.args), result: Devtools_1.safeValue(promisedResult), isPending: false, error: false }));
                })
                    .catch((error) => {
                    this.eventHub.emit(internalTypes_1.EventType.EFFECT, Object.assign({}, execution, effect, { args: Devtools_1.safeValues(effect.args), isPending: false, error: error.message }));
                    throw error;
                });
            }
            else {
                // eslint-disable-next-line standard/no-callback-literal
                this.eventHub.emit(internalTypes_1.EventType.EFFECT, Object.assign({}, execution, effect, { args: Devtools_1.safeValues(effect.args), result: Devtools_1.safeValue(result), isPending: false, error: false }));
            }
            return result;
        });
    }
    initializeDevtools(host, name, eventHub, proxyStateTree) {
        const devtools = new Devtools_1.Devtools(name);
        devtools.connect(host, (message) => {
            // To use for communication from devtools app
        });
        for (let type in internalTypes_1.EventType) {
            eventHub.on(internalTypes_1.EventType[type], (data) => devtools.send({
                type: internalTypes_1.EventType[type],
                data,
            }));
        }
        // This message is always the first as it is passed synchronously, all other
        // events are emitted async
        devtools.send({
            type: 'init',
            data: {
                state: proxyStateTree.sourceState,
            },
        });
        this.devtools = devtools;
    }
    getState(configuration) {
        let state = {};
        if (configuration.state) {
            state = this.processState(configuration.state);
        }
        return state;
    }
    processState(state) {
        return Object.keys(state).reduce((aggr, key) => {
            if (key === '__esModule') {
                return aggr;
            }
            const originalDescriptor = Object.getOwnPropertyDescriptor(state, key);
            if (originalDescriptor && 'get' in originalDescriptor) {
                Object.defineProperty(aggr, key, originalDescriptor);
                return aggr;
            }
            const value = state[key];
            if (is_plain_obj_1.default(value)) {
                aggr[key] = this.processState(value);
            }
            else if (typeof value === 'function') {
                aggr[key] = new derived_1.Derived(value);
            }
            else {
                Object.defineProperty(aggr, key, originalDescriptor);
            }
            return aggr;
        }, {});
    }
    getActions(configuration) {
        let actions = {};
        if (configuration.actions) {
            actions = configuration.actions;
        }
        const evaluatedActions = Object.keys(actions).reduce((aggr, name) => {
            if (typeof actions[name] === 'function') {
                return Object.assign(aggr, {
                    [name]: this.createAction(name, actions[name]),
                });
            }
            return Object.assign(aggr, {
                [name]: Object.keys(actions[name] || {}).reduce((aggr, subName) => Object.assign(aggr, typeof actions[name][subName] === 'function'
                    ? {
                        [subName]: this.createAction(subName, actions[name][subName]),
                    }
                    : {}), {}),
            });
        }, {});
        if (this.devtools) {
            Object.keys(evaluatedActions).forEach((key) => {
                if (typeof evaluatedActions[key] === 'function') {
                    evaluatedActions[key].displayName = key;
                }
                else {
                    Object.keys(evaluatedActions[key]).forEach((subKey) => {
                        evaluatedActions[key][subKey].displayName = key + '.' + subKey;
                    });
                }
            });
        }
        return evaluatedActions;
    }
    getTrackStateTree() {
        return this.proxyStateTree.getTrackStateTree();
    }
    getMutationTree() {
        return this.proxyStateTree.getMutationTree();
    }
}
exports.Overmind = Overmind;
function pipe(...operators) {
    const instance = (err, context, next, final = next) => {
        if (err)
            next(err);
        else {
            let operatorIndex = 0;
            let asyncTimeout;
            const finalClearingAsync = (...args) => {
                clearTimeout(asyncTimeout);
                final(...args);
            };
            const run = (runErr, runContext) => {
                asyncTimeout = setTimeout(() => {
                    context.execution.emit(internalTypes_1.EventType.OPERATOR_ASYNC, Object.assign({}, runContext.execution, { isAsync: true }));
                });
                operators[operatorIndex++](runErr, runContext, runNextOperator, finalClearingAsync);
            };
            const runNextOperator = (operatorError, operatorContext) => {
                clearTimeout(asyncTimeout);
                if (operatorError)
                    return next(operatorError);
                if (operatorIndex >= operators.length)
                    return next(null, operatorContext);
                if (operatorContext.value instanceof Promise) {
                    context.execution.emit(internalTypes_1.EventType.OPERATOR_ASYNC, Object.assign({}, operatorContext.execution, { isAsync: true }));
                    operatorContext.value
                        .then((promiseValue) => run(null, Object.assign({}, operatorContext, { value: promiseValue })))
                        .catch((promiseError) => next(promiseError, operatorContext));
                }
                else {
                    try {
                        run(null, operatorContext);
                    }
                    catch (operatorError) {
                        next(operatorError, operatorContext);
                    }
                }
            };
            runNextOperator(null, context);
        }
    };
    instance[IS_OPERATOR] = true;
    return instance;
}
exports.pipe = pipe;
/*
  OPERATORS
*/
function startDebugOperator(type, arg, context) {
    if (IS_PRODUCTION) {
        return;
    }
    const name = typeof arg === 'function' ? arg.displayName || arg.name : arg.toString();
    context.execution.emit(internalTypes_1.EventType.OPERATOR_START, Object.assign({}, context.execution, { name,
        type }));
}
function stopDebugOperator(context, value) {
    if (IS_PRODUCTION) {
        return;
    }
    if (value instanceof Promise) {
        value.then((promiseValue) => {
            context.execution.emit(internalTypes_1.EventType.OPERATOR_END, Object.assign({}, context.execution, { result: Devtools_1.safeValue(promiseValue), isAsync: true }));
        });
    }
    else {
        context.execution.emit(internalTypes_1.EventType.OPERATOR_END, Object.assign({}, context.execution, { result: Devtools_1.safeValue(value), isAsync: false }));
    }
}
function createContext(context, value, path) {
    if (IS_PRODUCTION) {
        return Object.assign({}, context, { value });
    }
    const newExecution = Object.assign({}, context.execution, { operatorId: context.execution.operatorId + 1, path: path || context.execution.path });
    return Object.assign({}, context, { value, execution: newExecution, effects: context.execution.trackEffects(newExecution) });
}
function createNextPath(next) {
    if (IS_PRODUCTION) {
        return next;
    }
    return (err, context) => {
        const newContext = Object.assign({}, context, { execution: Object.assign({}, context.execution, { path: context.execution.path.slice(0, context.execution.path.length - 1) }) });
        if (err)
            next(err, newContext);
        else
            next(null, newContext);
    };
}
function map(operation) {
    const instance = (err, context, next) => {
        if (err)
            next(err);
        else {
            startDebugOperator('map', operation, context);
            const value = operation(context);
            stopDebugOperator(context, value);
            next(null, createContext(context, value));
        }
    };
    instance[IS_OPERATOR] = true;
    return instance;
}
exports.map = map;
function forEach(forEachItemOperator) {
    const instance = (err, context, next) => {
        if (err)
            next(err);
        else {
            let array = context.value;
            let evaluatingCount = array.length;
            let lastContext;
            let hasErrored = false;
            const evaluate = (err) => {
                if (hasErrored) {
                    return;
                }
                if (err) {
                    hasErrored = true;
                    return next(err);
                }
                evaluatingCount--;
                if (!evaluatingCount) {
                    stopDebugOperator(lastContext, lastContext.value);
                    next(null, lastContext);
                }
            };
            startDebugOperator('forEach', '', context);
            array.forEach((value, index) => {
                lastContext = createContext(lastContext || context, value, context.execution.path.concat(String(index)));
                const nextWithPath = createNextPath(evaluate);
                forEachItemOperator(null, lastContext, nextWithPath);
            });
        }
    };
    instance[IS_OPERATOR] = true;
    return instance;
}
exports.forEach = forEach;
function parallel(...operators) {
    const instance = (err, context, next) => {
        if (err)
            next(err);
        else {
            let evaluatingCount = operators.length;
            let lastContext;
            let hasErrored = false;
            const evaluate = (err) => {
                if (hasErrored) {
                    return;
                }
                if (err) {
                    hasErrored = true;
                    return next(err, lastContext);
                }
                evaluatingCount--;
                if (!evaluatingCount) {
                    stopDebugOperator(lastContext, lastContext.value);
                    next(null, lastContext);
                }
            };
            startDebugOperator('parallel', '', context);
            operators.forEach((operator, index) => {
                lastContext = createContext(lastContext || context, context.value, context.execution.path.concat(String(index)));
                const nextWithPath = createNextPath(evaluate);
                operator(null, lastContext, nextWithPath);
            });
        }
    };
    instance[IS_OPERATOR] = true;
    return instance;
}
exports.parallel = parallel;
function filter(operation) {
    const instance = (err, context, next, final) => {
        if (err)
            next(err);
        else {
            startDebugOperator('filter', operation, context);
            if (operation(context)) {
                stopDebugOperator(context, context.value);
                next(null, createContext(context, context.value));
            }
            else {
                stopDebugOperator(context, context.value);
                final(null, createContext(context, context.value));
            }
        }
    };
    instance[IS_OPERATOR] = true;
    return instance;
}
exports.filter = filter;
function action(operation) {
    const instance = (err, context, next) => {
        if (err)
            next(err);
        else {
            startDebugOperator('action', operation, context);
            const mutationTree = context.execution.getMutationTree();
            if (!IS_PRODUCTION) {
                mutationTree.onMutation((mutation) => {
                    context.execution.emit(internalTypes_1.EventType.MUTATIONS, Object.assign({}, context.execution, { mutations: exports.makeStringifySafeMutations([mutation]) }));
                    setTimeout(() => {
                        const flushData = mutationTree.flush(true);
                        if (flushData) {
                            context.execution.send({
                                type: 'flush',
                                data: Object.assign({}, context.execution, flushData, { mutations: exports.makeStringifySafeMutations(flushData.mutations) }),
                            });
                        }
                    });
                });
            }
            const maybePromise = operation(Object.assign({}, context, { value: IS_PRODUCTION
                    ? context.value
                    : context.execution.scopeValue(context.value, mutationTree), state: mutationTree.state }));
            stopDebugOperator(context, maybePromise);
            next(null, createContext(context, maybePromise instanceof Promise
                ? maybePromise.then(() => context.value)
                : context.value));
        }
    };
    instance[IS_OPERATOR] = true;
    return instance;
}
exports.action = action;
function fork(operation, paths) {
    const instance = (err, context, next) => {
        if (err)
            next(err);
        else {
            startDebugOperator('fork', operation, context);
            const path = operation(context);
            const newContext = createContext(context, context.value, context.execution.path.concat(path));
            const nextWithPaths = createNextPath((err, returnedContext) => {
                if (err)
                    next(err);
                else {
                    stopDebugOperator(context, context.value);
                    next(null, Object.assign({}, returnedContext, { value: newContext.value }));
                }
            });
            paths[path](null, newContext, nextWithPaths);
        }
    };
    instance[IS_OPERATOR] = true;
    return instance;
}
exports.fork = fork;
function when(operation, paths) {
    const instance = (err, context, next) => {
        if (err)
            next(err);
        else {
            startDebugOperator('when', operation, context);
            const newContext = createContext(context, context.value, context.execution.path.concat('true'));
            if (operation(context)) {
                const nextWithPath = createNextPath(next);
                stopDebugOperator(context, context.value);
                paths.true(null, newContext, nextWithPath);
            }
            else {
                const newContext = createContext(context, context.value, context.execution.path.concat('false'));
                const nextWithPath = createNextPath(next);
                stopDebugOperator(context, context.value);
                paths.false(null, newContext, nextWithPath);
            }
        }
    };
    instance[IS_OPERATOR] = true;
    return instance;
}
exports.when = when;
function wait(ms) {
    const instance = (err, context, next) => {
        if (err)
            next(err);
        else {
            startDebugOperator('wait', ms, context);
            setTimeout(() => {
                stopDebugOperator(context, context.value);
                next(null, createContext(context, context.value));
            }, ms);
        }
    };
    instance[IS_OPERATOR] = true;
    return instance;
}
exports.wait = wait;
function debounce(ms) {
    let timeout;
    let previousFinal;
    const instance = (err, context, next, final) => {
        if (err) {
            return next(err);
        }
        startDebugOperator('debounce', ms, context);
        if (timeout) {
            clearTimeout(timeout);
            previousFinal(null, context);
        }
        previousFinal = final;
        timeout = setTimeout(() => {
            timeout = null;
            stopDebugOperator(context, context.value);
            next(null, createContext(context, context.value));
        }, ms);
    };
    instance[IS_OPERATOR] = true;
    return instance;
}
exports.debounce = debounce;
//# sourceMappingURL=index.js.map