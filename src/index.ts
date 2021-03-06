import { EventEmitter } from 'betsy'
import isPlainObject from 'is-plain-obj'
import {
  IS_PROXY,
  ProxyStateTree,
  TTree,
  IMutation,
  VALUE,
  IMutationCallback,
} from 'proxy-state-tree'
import { Derived } from './derived'
import { Devtools, Message, safeValue, safeValues } from './Devtools'
import {
  Events,
  EventType,
  Options,
  ResolveActions,
  ResolveState,
  Execution,
  ResolveMockActions,
  NestedPartial,
} from './internalTypes'
import { proxifyEffects } from './proxyfyEffects'
import {
  Configuration,
  IAction,
  IDerive,
  IOperator,
  TValueContext,
  IOnInitialize,
  TStateObject,
} from './types'

export * from './types'

/** This type can be overwriten by app developers if they want to avoid
 * typing and then they can import `Action`,  `Operation` etc. directly from
 * overmind.
 */
export interface Config {}

export interface Action<Value = void> extends IAction<Config, Value> {}

export interface Derive<Parent extends TStateObject, Value>
  extends IDerive<Config, Parent, Value> {}

export interface OnInitialize extends IOnInitialize<Config> {}

const IS_NODE =
  typeof module !== 'undefined' && (!this || this.module !== module)
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development'
const IS_OPERATOR = Symbol('operator')

export const makeStringifySafeMutations = (mutations: IMutation[]) => {
  return mutations.map((mutation) => ({
    ...mutation,
    args: safeValues(mutation.args),
  }))
}

function deepCopy(obj) {
  if (isPlainObject(obj)) {
    return Object.keys(obj).reduce((aggr, key) => {
      aggr[key] = deepCopy(obj[key])

      return aggr
    }, {})
  } else if (Array.isArray(obj)) {
    return obj.map((item) => deepCopy(item))
  }

  return obj
}

export function createOvermindMock<Config extends Configuration>(
  config: Config,
  mockedEffects?: NestedPartial<Config['effects']>
): {
  actions: ResolveMockActions<Config['actions']>
  state: ResolveState<Config['state']>
} {
  const mock = new Overmind(
    Object.assign({}, config, {
      state: deepCopy(config.state),
    }),
    {
      devtools: false,
      testMode: {
        effectsCallback: (effect) => {
          const mockedEffect = (effect.name
            ? effect.name.split('.')
            : []
          ).reduce((aggr, key) => (aggr ? aggr[key] : aggr), mockedEffects)

          if (!mockedEffect || (mockedEffect && !mockedEffect[effect.method])) {
            throw new Error(
              `The effect "${effect.name}" with metod ${
                effect.method
              } has not been mocked`
            )
          }
          return mockedEffect[effect.method]({
            path: effect.name + '.' + effect.method,
            args: effect.args,
          })
        },
        actionCallback: (execution) => {
          return execution.flush().mutations
        },
      },
    }
  )

  return {
    actions: mock.actions as any,
    state: mock.state,
  }
}

const hotReloadingCache = {}

// We do not use TConfig<Config> directly to type the class in order to avoid
// the 'import(...)' function to be used in exported types.

export class Overmind<Config extends Configuration> implements Configuration {
  private proxyStateTree: ProxyStateTree<object>
  private actionReferences: Function[] = []
  private nextExecutionId: number = 0
  private options: Options
  initialized: Promise<any>
  eventHub: EventEmitter<Events>
  devtools: Devtools
  actions: ResolveActions<Config['actions']>
  state: ResolveState<Config['state']>
  effects: Config['effects'] & {}
  constructor(configuration: Config, options: Options = {}) {
    const name = options.name || 'MyConfig'

    if (IS_DEVELOPMENT) {
      if (hotReloadingCache[name]) {
        return hotReloadingCache[name]
      } else {
        hotReloadingCache[name] = this
      }
    }

    /*
      Set up an eventHub to trigger information from derived, computed and reactions
    */
    const eventHub = new EventEmitter<Events>()

    /*
      Create the proxy state tree instance with the state and a wrapper to expose
      the eventHub
    */
    const proxyStateTree = new ProxyStateTree(
      this.getState(configuration) as any,
      {
        devmode: !IS_PRODUCTION,
        dynamicWrapper: (_, path, func) => func(eventHub, proxyStateTree, path),
        onGetter: (path, value) =>
          this.eventHub.emit(EventType.GETTER, {
            path,
            value: safeValue(value),
          }),
      }
    )

    this.state = proxyStateTree.state
    this.effects = configuration.effects || {}
    this.proxyStateTree = proxyStateTree
    this.eventHub = eventHub
    this.options = options

    if (!IS_PRODUCTION && typeof window !== 'undefined') {
      let warning = 'OVERMIND: You are running in DEVELOPMENT mode.'
      if (options.logProxies !== true) {
        const originalConsoleLog = console.log

        console.log = (...args) =>
          originalConsoleLog.apply(
            console,
            args.map((arg) => (arg && arg[IS_PROXY] ? arg[VALUE] : arg))
          )
        warning +=
          '\n\n - To improve debugging experience "console.log" will NOT log proxies from Overmind, but the actual value. Please see docs to turn off this behaviour'
      }

      if (
        options.devtools ||
        (typeof location !== 'undefined' &&
          location.hostname === 'localhost' &&
          options.devtools !== false)
      ) {
        const host =
          options.devtools === true ? 'localhost:3031' : options.devtools
        const name = options.name
          ? options.name
          : typeof document === 'undefined'
          ? 'NoName'
          : document.title || 'NoName'

        this.initializeDevtools(host, name, eventHub, proxyStateTree)
      } else {
        warning +=
          '\n\n - You are not running on localhost. You will have to manually define the devtools option to connect'
      }

      if (!IS_NODE) {
        console.warn(warning)
      }
    }

    if (IS_PRODUCTION) {
      eventHub.on(EventType.OPERATOR_ASYNC, () => {
        proxyStateTree.getMutationTree().flush()
      })
      eventHub.on(EventType.ACTION_END, () => {
        proxyStateTree.getMutationTree().flush()
      })

      let nextTick
      const flushTree = () => {
        proxyStateTree.getMutationTree().flush(true)
      }

      this.proxyStateTree.onMutation(() => {
        nextTick && clearTimeout(nextTick)
        nextTick = setTimeout(flushTree, 0)
      })
    } else if (!options.testMode) {
      eventHub.on(EventType.OPERATOR_ASYNC, (execution) => {
        const flushData = execution.flush()
        if (this.devtools && flushData) {
          this.devtools.send({
            type: 'flush',
            data: {
              ...execution,
              ...flushData,
            },
          })
        }
      })
      eventHub.on(EventType.ACTION_END, (execution) => {
        const flushData = execution.flush()

        if (this.devtools && flushData) {
          this.devtools.send({
            type: 'flush',
            data: {
              ...execution,
              ...flushData,
            },
          })
        }
      })
    }

    /*
      Expose the created actions
    */
    this.actions = this.getActions(configuration)

    if (configuration.onInitialize) {
      const onInitialize = this.createAction(
        'onInitialize',
        configuration.onInitialize,
        true
      )

      this.initialized = Promise.resolve(onInitialize(this))
    } else {
      this.initialized = Promise.resolve(null)
    }
  }
  private createExecution(name, action) {
    if (IS_PRODUCTION) {
      return ({
        getMutationTree: () => {
          return this.proxyStateTree.getMutationTree()
        },
        emit: this.eventHub.emit.bind(this.eventHub),
      } as any) as Execution
    }

    const mutationTrees: any[] = []
    const execution = {
      actionId: this.actionReferences.indexOf(action),
      executionId: this.nextExecutionId++,
      actionName: name,
      operatorId: 0,
      path: [],
      emit: this.eventHub.emit.bind(this.eventHub),
      send: this.devtools ? this.devtools.send.bind(this.devtools) : () => {},
      trackEffects: this.trackEffects.bind(this, this.effects),
      flush: () => {
        return this.proxyStateTree.flush(mutationTrees)
      },
      getMutationTree: () => {
        const mutationTree = this.proxyStateTree.getMutationTree()

        mutationTrees.push(mutationTree)

        return mutationTree
      },
      scopeValue: (value, tree) => {
        return this.scopeValue(value, tree)
      },
    }

    return execution
  }
  private createContext(value, execution, tree) {
    return {
      value,
      state: tree.state,
      actions: this.actions,
      execution,
      proxyStateTree: this.proxyStateTree,
      effects: this.trackEffects(this.effects, execution),
    }
  }
  private scopeValue(value: any, tree: TTree) {
    if (!value) {
      return value
    }
    if (value[IS_PROXY]) {
      return this.proxyStateTree.rescope(value, tree)
    } else if (isPlainObject(value)) {
      return Object.assign(
        {},
        ...Object.keys(value).map((key) => ({
          [key]: this.proxyStateTree.rescope(value[key], tree),
        }))
      )
    } else {
      return value
    }
  }
  private createAction(name, action, isOnInitialize = false) {
    this.actionReferences.push(action)
    const actionFunc = async (value?) => {
      if (IS_PRODUCTION || action[IS_OPERATOR]) {
        return new Promise((resolve, reject) => {
          const execution = this.createExecution(name, action)
          this.eventHub.emit(EventType.ACTION_START, execution)

          action[IS_OPERATOR]
            ? action(
                null,
                {
                  value,
                  state: this.proxyStateTree.state,
                  actions: this.actions,
                  execution,
                  effects: this.trackEffects(this.effects, execution),
                },
                (err, finalContext) => {
                  finalContext &&
                    this.eventHub.emit(EventType.ACTION_END, {
                      ...finalContext.execution,
                      operatorId: finalContext.execution.operatorId - 1,
                    })
                  if (err) reject(err)
                  else resolve(this.options.testMode && finalContext.execution)
                }
              )
            : resolve(
                action(
                  this.createContext(
                    value,
                    execution,
                    execution.getMutationTree()
                  )
                )
                  ? undefined
                  : undefined
              )
        })
      } else {
        const execution = {
          ...this.createExecution(name, action),
          operatorId: 0,
          type: 'action',
        }
        this.eventHub.emit(EventType.ACTION_START, execution)
        this.eventHub.emit(EventType.OPERATOR_START, execution)

        const mutationTree = execution.getMutationTree()

        mutationTree.onMutation((mutation) => {
          this.eventHub.emit(EventType.MUTATIONS, {
            ...execution,
            mutations: makeStringifySafeMutations([mutation]),
          })

          setTimeout(() => {
            const flushData = mutationTree.flush(true)

            if (this.devtools && flushData) {
              this.devtools.send({
                type: 'flush',
                data: {
                  ...execution,
                  ...flushData,
                  mutations: makeStringifySafeMutations(flushData.mutations),
                },
              })
            }
          })
        })

        const context = this.createContext(
          this.scopeValue(value, mutationTree),
          execution,
          mutationTree
        )
        const result = isOnInitialize ? await action(context) : action(context)

        this.eventHub.emit(EventType.OPERATOR_END, {
          ...execution,
          isAsync: result instanceof Promise,
          result: undefined,
        })
        this.eventHub.emit(EventType.ACTION_END, execution)

        return Promise.resolve(this.options.testMode && execution)
      }
    }

    if (this.options.testMode) {
      const actionCallback = this.options.testMode.actionCallback

      return (value?) => (actionFunc as any)(value).then(actionCallback)
    }

    return actionFunc
  }
  private trackEffects(effects = {}, execution) {
    if (IS_PRODUCTION) {
      return effects
    }

    return proxifyEffects(this.effects, (effect) => {
      let result
      try {
        result = this.options.testMode
          ? this.options.testMode.effectsCallback(effect)
          : effect.func.apply(this, effect.args)
      } catch (error) {
        // eslint-disable-next-line standard/no-callback-literal
        this.eventHub.emit(EventType.EFFECT, {
          ...execution,
          ...effect,
          args: safeValues(effect.args),
          isPending: false,
          error: error.message,
        })
        throw error
      }

      if (result instanceof Promise) {
        // eslint-disable-next-line standard/no-callback-literal
        this.eventHub.emit(EventType.EFFECT, {
          ...execution,
          ...effect,
          args: safeValues(effect.args),
          isPending: true,
          error: false,
        })
        result
          .then((promisedResult) => {
            // eslint-disable-next-line standard/no-callback-literal
            this.eventHub.emit(EventType.EFFECT, {
              ...execution,
              ...effect,
              args: safeValues(effect.args),
              result: safeValue(promisedResult),
              isPending: false,
              error: false,
            })
          })
          .catch((error) => {
            this.eventHub.emit(EventType.EFFECT, {
              ...execution,
              ...effect,
              args: safeValues(effect.args),
              isPending: false,
              error: error.message,
            })
            throw error
          })
      } else {
        // eslint-disable-next-line standard/no-callback-literal
        this.eventHub.emit(EventType.EFFECT, {
          ...execution,
          ...effect,
          args: safeValues(effect.args),
          result: safeValue(result),
          isPending: false,
          error: false,
        })
      }

      return result
    })
  }
  private initializeDevtools(host, name, eventHub, proxyStateTree) {
    const devtools = new Devtools(name)
    devtools.connect(
      host,
      (message: Message) => {
        // To use for communication from devtools app
      }
    )
    for (let type in EventType) {
      eventHub.on(EventType[type], (data) =>
        devtools.send({
          type: EventType[type],
          data,
        })
      )
    }
    // This message is always the first as it is passed synchronously, all other
    // events are emitted async
    devtools.send({
      type: 'init',
      data: {
        state: proxyStateTree.sourceState,
      },
    })
    this.devtools = devtools
  }
  private getState(configuration: Configuration) {
    let state = {}
    if (configuration.state) {
      state = this.processState(configuration.state)
    }

    return state
  }
  private processState(state: {}) {
    return Object.keys(state).reduce((aggr, key) => {
      if (key === '__esModule') {
        return aggr
      }
      const originalDescriptor = Object.getOwnPropertyDescriptor(state, key)

      if (originalDescriptor && 'get' in originalDescriptor) {
        Object.defineProperty(aggr, key, originalDescriptor as any)

        return aggr
      }

      const value = state[key]

      if (isPlainObject(value)) {
        aggr[key] = this.processState(value)
      } else if (typeof value === 'function') {
        aggr[key] = new Derived(value)
      } else {
        Object.defineProperty(aggr, key, originalDescriptor as any)
      }

      return aggr
    }, {})
  }
  private getActions(configuration: Configuration) {
    let actions = {}
    if (configuration.actions) {
      actions = configuration.actions
    }

    const evaluatedActions = Object.keys(actions).reduce((aggr, name) => {
      if (typeof actions[name] === 'function') {
        return Object.assign(aggr, {
          [name]: this.createAction(name, actions[name]),
        })
      }

      return Object.assign(aggr, {
        [name]: Object.keys(actions[name] || {}).reduce(
          (aggr, subName) =>
            Object.assign(
              aggr,
              typeof actions[name][subName] === 'function'
                ? {
                    [subName]: this.createAction(
                      subName,
                      actions[name][subName]
                    ),
                  }
                : {}
            ),
          {}
        ),
      })
    }, {}) as any

    if (this.devtools) {
      Object.keys(evaluatedActions).forEach((key) => {
        if (typeof evaluatedActions[key] === 'function') {
          evaluatedActions[key].displayName = key
        } else {
          Object.keys(evaluatedActions[key]).forEach((subKey) => {
            evaluatedActions[key][subKey].displayName = key + '.' + subKey
          })
        }
      })
    }

    return evaluatedActions
  }
  getTrackStateTree() {
    return this.proxyStateTree.getTrackStateTree()
  }
  getMutationTree() {
    return this.proxyStateTree.getMutationTree()
  }
  addMutationListener = (cb: IMutationCallback) => {
    return this.proxyStateTree.onMutation(cb)
  }
}

/*
  OPERATORS
  needs to be in this file for typing override to work
*/
export type Operator<Input = void, Output = Input> = IOperator<
  Config,
  Input,
  Output
>

export function pipe<ThisConfig extends Configuration, A, B>(
  aOperator: IOperator<ThisConfig, A, B>
): IOperator<ThisConfig, A, B>

export function pipe<ThisConfig extends Configuration, A, B, C>(
  aOperator: IOperator<ThisConfig, A, B>,
  bOperator: IOperator<ThisConfig, B, C>
): IOperator<ThisConfig, A, C>

export function pipe<ThisConfig extends Configuration, A, B, C, D>(
  aOperator: IOperator<ThisConfig, A, B>,
  bOperator: IOperator<ThisConfig, B, C>,
  cOperator: IOperator<ThisConfig, C, D>
): IOperator<ThisConfig, A, D>

export function pipe<ThisConfig extends Configuration, A, B, C, D, E>(
  aOperator: IOperator<ThisConfig, A, B>,
  bOperator: IOperator<ThisConfig, B, C>,
  cOperator: IOperator<ThisConfig, C, D>,
  dOperator: IOperator<ThisConfig, D, E>
): IOperator<ThisConfig, A, E>

export function pipe<ThisConfig extends Configuration, A, B, C, D, E, F>(
  aOperator: IOperator<ThisConfig, A, B>,
  bOperator: IOperator<ThisConfig, B, C>,
  cOperator: IOperator<ThisConfig, C, D>,
  dOperator: IOperator<ThisConfig, D, E>,
  eOperator: IOperator<ThisConfig, E, F>
): IOperator<ThisConfig, A, F>

export function pipe<ThisConfig extends Configuration, A, B, C, D, E, F, G>(
  aOperator: IOperator<ThisConfig, A, B>,
  bOperator: IOperator<ThisConfig, B, C>,
  cOperator: IOperator<ThisConfig, C, D>,
  dOperator: IOperator<ThisConfig, D, E>,
  eOperator: IOperator<ThisConfig, E, F>,
  fOperator: IOperator<ThisConfig, F, G>
): IOperator<ThisConfig, A, G>

export function pipe(...operators) {
  const instance = (err, context, next, final = next) => {
    if (err) next(err)
    else {
      let operatorIndex = 0
      let asyncTimeout
      const finalClearingAsync = (...args) => {
        clearTimeout(asyncTimeout)
        final(...args)
      }
      const run = (runErr, runContext) => {
        asyncTimeout = setTimeout(() => {
          context.execution.emit(EventType.OPERATOR_ASYNC, {
            ...runContext.execution,
            isAsync: true,
          })
        })
        operators[operatorIndex++](
          runErr,
          runContext,
          runNextOperator,
          finalClearingAsync
        )
      }

      const runNextOperator = (operatorError, operatorContext) => {
        clearTimeout(asyncTimeout)
        if (operatorError) return next(operatorError)
        if (operatorIndex >= operators.length)
          return next(null, operatorContext)

        if (operatorContext.value instanceof Promise) {
          context.execution.emit(EventType.OPERATOR_ASYNC, {
            ...operatorContext.execution,
            isAsync: true,
          })
          operatorContext.value
            .then((promiseValue) =>
              run(null, { ...operatorContext, value: promiseValue })
            )
            .catch((promiseError) => next(promiseError, operatorContext))
        } else {
          try {
            run(null, operatorContext)
          } catch (operatorError) {
            next(operatorError, operatorContext)
          }
        }
      }

      runNextOperator(null, context)
    }
  }
  instance[IS_OPERATOR] = true
  return instance
}

/*
  OPERATORS
*/

function startDebugOperator(type, arg, context) {
  if (IS_PRODUCTION) {
    return
  }
  const name =
    typeof arg === 'function' ? arg.displayName || arg.name : arg.toString()

  context.execution.emit(EventType.OPERATOR_START, {
    ...context.execution,
    name,
    type,
  })
}

function stopDebugOperator(context, value) {
  if (IS_PRODUCTION) {
    return
  }

  if (value instanceof Promise) {
    value.then((promiseValue) => {
      context.execution.emit(EventType.OPERATOR_END, {
        ...context.execution,
        result: safeValue(promiseValue),
        isAsync: true,
      })
    })
  } else {
    context.execution.emit(EventType.OPERATOR_END, {
      ...context.execution,
      result: safeValue(value),
      isAsync: false,
    })
  }
}

function createContext(context, value, path?) {
  if (IS_PRODUCTION) {
    return {
      ...context,
      value,
    }
  }

  const newExecution = {
    ...context.execution,
    operatorId: context.execution.operatorId + 1,
    path: path || context.execution.path,
  }

  return {
    ...context,
    value,
    execution: newExecution,
    effects: context.execution.trackEffects(newExecution),
  }
}

function createNextPath(next) {
  if (IS_PRODUCTION) {
    return next
  }

  return (err, context) => {
    const newContext = {
      ...context,
      execution: {
        ...context.execution,
        path: context.execution.path.slice(
          0,
          context.execution.path.length - 1
        ),
      },
    }
    if (err) next(err, newContext)
    else next(null, newContext)
  }
}

export function map<Input, Output, ThisConfig extends Configuration = Config>(
  operation: (input: TValueContext<ThisConfig, Input>) => Output
): IOperator<ThisConfig, Input, Output extends Promise<infer U> ? U : Output> {
  const instance = (err, context, next) => {
    if (err) next(err)
    else {
      startDebugOperator('map', operation, context)
      const value = operation(context)
      stopDebugOperator(context, value)
      next(null, createContext(context, value))
    }
  }
  instance[IS_OPERATOR] = true

  return instance
}

export function forEach<
  Input extends any[],
  ThisConfig extends Configuration = Config
>(
  forEachItemOperator: IOperator<ThisConfig, Input[0], any>
): IOperator<ThisConfig, Input, Input> {
  const instance = (err, context, next) => {
    if (err) next(err)
    else {
      let array = context.value
      let evaluatingCount = array.length
      let lastContext
      let hasErrored = false
      const evaluate = (err) => {
        if (hasErrored) {
          return
        }
        if (err) {
          hasErrored = true
          return next(err)
        }
        evaluatingCount--

        if (!evaluatingCount) {
          stopDebugOperator(lastContext, lastContext.value)
          next(null, lastContext)
        }
      }
      startDebugOperator('forEach', '', context)

      array.forEach((value, index) => {
        lastContext = createContext(
          lastContext || context,
          value,
          context.execution.path.concat(String(index))
        )
        const nextWithPath = createNextPath(evaluate)
        forEachItemOperator(null, lastContext, nextWithPath)
      })
    }
  }
  instance[IS_OPERATOR] = true

  return instance
}

export function parallel<Input, ThisConfig extends Configuration = Config>(
  ...operators: IOperator<ThisConfig, Input>[]
): IOperator<ThisConfig, Input, Input> {
  const instance = (err, context, next) => {
    if (err) next(err)
    else {
      let evaluatingCount = operators.length
      let lastContext
      let hasErrored = false
      const evaluate = (err) => {
        if (hasErrored) {
          return
        }
        if (err) {
          hasErrored = true
          return next(err, lastContext)
        }
        evaluatingCount--

        if (!evaluatingCount) {
          stopDebugOperator(lastContext, lastContext.value)
          next(null, lastContext)
        }
      }
      startDebugOperator('parallel', '', context)

      operators.forEach((operator, index) => {
        lastContext = createContext(
          lastContext || context,
          context.value,
          context.execution.path.concat(String(index))
        )
        const nextWithPath = createNextPath(evaluate)
        operator(null, lastContext, nextWithPath)
      })
    }
  }
  instance[IS_OPERATOR] = true

  return instance
}

export function filter<Input, ThisConfig extends Configuration = Config>(
  operation: (input: TValueContext<ThisConfig, Input>) => boolean
): IOperator<ThisConfig, Input, Input> {
  const instance = (err, context, next, final) => {
    if (err) next(err)
    else {
      startDebugOperator('filter', operation, context)
      if (operation(context)) {
        stopDebugOperator(context, context.value)
        next(null, createContext(context, context.value))
      } else {
        stopDebugOperator(context, context.value)
        final(null, createContext(context, context.value))
      }
    }
  }
  instance[IS_OPERATOR] = true

  return instance
}

export function action<Input, ThisConfig extends Configuration = Config>(
  operation: (input: TValueContext<ThisConfig, Input>) => void
): IOperator<ThisConfig, Input, Input> {
  const instance = (err, context, next) => {
    if (err) next(err)
    else {
      startDebugOperator('action', operation, context)

      const mutationTree = context.execution.getMutationTree()
      if (!IS_PRODUCTION) {
        mutationTree.onMutation((mutation) => {
          context.execution.emit(EventType.MUTATIONS, {
            ...context.execution,
            mutations: makeStringifySafeMutations([mutation]),
          })
          setTimeout(() => {
            const flushData = mutationTree.flush(true)
            if (flushData) {
              context.execution.send({
                type: 'flush',
                data: {
                  ...context.execution,
                  ...flushData,
                  mutations: makeStringifySafeMutations(flushData.mutations),
                },
              })
            }
          })
        })
      }
      const maybePromise: any = operation({
        ...context,
        value: IS_PRODUCTION
          ? context.value
          : context.execution.scopeValue(context.value, mutationTree),
        state: mutationTree.state,
      })

      stopDebugOperator(context, maybePromise)

      next(
        null,
        createContext(
          context,
          maybePromise instanceof Promise
            ? maybePromise.then(() => context.value)
            : context.value
        )
      )
    }
  }
  instance[IS_OPERATOR] = true

  return instance
}

export function fork<
  Input,
  Paths extends { [key: string]: IOperator<ThisConfig, Input, any> },
  ThisConfig extends Configuration = Config
>(
  operation: (input: TValueContext<ThisConfig, Input>) => keyof Paths,
  paths: Paths
): IOperator<ThisConfig, Input, Input> {
  const instance = (err, context, next) => {
    if (err) next(err)
    else {
      startDebugOperator('fork', operation, context)
      const path = operation(context)
      const newContext = createContext(
        context,
        context.value,
        context.execution.path.concat(path)
      )
      const nextWithPaths = createNextPath((err, returnedContext) => {
        if (err) next(err)
        else {
          stopDebugOperator(context, context.value)
          next(null, { ...returnedContext, value: newContext.value })
        }
      })
      paths[path](null, newContext, nextWithPaths)
    }
  }
  instance[IS_OPERATOR] = true

  return instance
}

export function when<
  Input,
  OutputA,
  OutputB,
  ThisConfig extends Configuration = Config
>(
  operation: (input: TValueContext<ThisConfig, Input>) => boolean,
  paths: {
    true: IOperator<ThisConfig, Input, OutputA>
    false: IOperator<ThisConfig, Input, OutputB>
  }
): IOperator<ThisConfig, Input, OutputA | OutputB> {
  const instance = (err, context, next) => {
    if (err) next(err)
    else {
      startDebugOperator('when', operation, context)
      const newContext = createContext(
        context,
        context.value,
        context.execution.path.concat('true')
      )
      if (operation(context)) {
        const nextWithPath = createNextPath(next)
        stopDebugOperator(context, context.value)
        paths.true(null, newContext, nextWithPath)
      } else {
        const newContext = createContext(
          context,
          context.value,
          context.execution.path.concat('false')
        )
        const nextWithPath = createNextPath(next)
        stopDebugOperator(context, context.value)
        paths.false(null, newContext, nextWithPath)
      }
    }
  }
  instance[IS_OPERATOR] = true

  return instance
}

export function wait<Input, ThisConfig extends Configuration = Config>(
  ms: number
): IOperator<ThisConfig, Input, Input> {
  const instance = (err, context, next) => {
    if (err) next(err)
    else {
      startDebugOperator('wait', ms, context)
      setTimeout(() => {
        stopDebugOperator(context, context.value)
        next(null, createContext(context, context.value))
      }, ms)
    }
  }
  instance[IS_OPERATOR] = true

  return instance
}

export function debounce<Input, ThisConfig extends Configuration = Config>(
  ms: number
): IOperator<ThisConfig, Input, Input> {
  let timeout
  let previousFinal
  const instance = (err, context, next, final) => {
    if (err) {
      return next(err)
    }
    startDebugOperator('debounce', ms, context)
    if (timeout) {
      clearTimeout(timeout)
      previousFinal(null, context)
    }
    previousFinal = final
    timeout = setTimeout(() => {
      timeout = null
      stopDebugOperator(context, context.value)
      next(null, createContext(context, context.value))
    }, ms)
  }
  instance[IS_OPERATOR] = true

  return instance
}
