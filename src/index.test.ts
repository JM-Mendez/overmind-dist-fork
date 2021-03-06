import { EventType, Overmind, IAction } from './'
import { namespaced } from './config'

function toJSON(obj) {
  return JSON.parse(JSON.stringify(obj))
}

function createDefaultOvermind() {
  const state = {
    foo: 'bar',
    item: {
      isAwesome: true,
    },
  }
  const changeFoo: Action = (context) => {
    context.state.foo = 'bar2'
  }
  const changeFooWithEffect: Action = (context) => {
    context.state.foo = context.effects.hello()
  }
  const waitAndChangeFoo: Action = (context) => {
    return context.effects.wait().then(() => {
      context.state.foo = 'bar2'
    })
  }
  const asyncChangeFoo: Action = async (context) => {
    await Promise.resolve()
    context.state.foo = 'bar2'
  }
  const changeValue: Action<{ isAwesome: boolean }> = (context) => {
    context.value.isAwesome = !context.value.isAwesome
  }
  const changeFormValue: Action<{
    key: string
    form: { [key: string]: any }
    value: any
  }> = (context) => {
    const { form, key, value } = context.value
    form[key] = value
  }
  const actions = {
    asyncChangeFoo,
    changeFormValue,
    changeFoo,
    changeFooWithEffect,
    changeValue,
    waitAndChangeFoo,
  }
  const effects = {
    hello() {
      return 'hello'
    },
    wait() {
      return Promise.resolve()
    },
  }
  const config = {
    state,
    actions,
    effects,
  }

  type Config = typeof config

  interface Action<Value = void> extends IAction<Config, Value> {}

  const app = new Overmind(config)

  return app
}

describe('Overmind', () => {
  test('should instantiate app with state', () => {
    const app = new Overmind({
      state: {
        foo: 'bar',
      },
    })

    expect(app.state.foo).toEqual('bar')
  })

  test('should instantiate app with onInitialize', async () => {
    expect.assertions(2)
    let value: any
    const app = new Overmind({
      onInitialize(context) {
        expect(context.state.foo).toBe('bar')
        value = context.value
      },
      state: {
        foo: 'bar',
      },
      actions: {
        doThis() {},
      },
    })
    await app.initialized
    expect(value).toBe(app)
  })

  test('should instantiate app with an async onInitialize', async () => {
    expect.assertions(3)
    let value: any
    const app = new Overmind({
      async onInitialize(context) {
        expect(context.state.foo).toBe('bar')
        value = context.value

        context.state.foo = await new Promise((resolve) =>
          setTimeout(() => resolve('foo.bar'), 1000)
        )
      },
      state: {
        foo: 'bar',
      },
      actions: {
        doThis() {},
      },
    })

    await app.initialized
    expect(value).toBe(app)
    expect(app.state.foo).toBe('foo.bar')
  })

  test('should be able to type actions', () => {
    expect.assertions(2)

    const app = createDefaultOvermind()

    expect(app.state.foo).toBe('bar')
    app.actions.changeFoo()
    expect(app.state.foo).toBe('bar2')
  })
  test('should allow changing state in actions', () => {
    expect.assertions(2)
    const app = createDefaultOvermind()

    expect(app.state.foo).toBe('bar')
    app.actions.changeFoo()
    expect(app.state.foo).toBe('bar2')
  })
  test('should expose effects to actions', () => {
    expect.assertions(2)
    const app = createDefaultOvermind()

    expect(app.state.foo).toBe('bar')
    app.actions.changeFooWithEffect()
    expect(app.state.foo).toBe('hello')
  })
  test('should be able to do mutations async via effects', () => {
    expect.assertions(2)
    const app = createDefaultOvermind()
    expect(app.state.foo).toBe('bar')
    return app.actions.waitAndChangeFoo().then(() => {
      expect(app.state.foo).toBe('bar2')
    })
  })
  test('should track action start and end', () => {
    expect.assertions(2)
    const app = new Overmind({
      actions: {
        doThis() {},
      },
    })
    app.eventHub.once(EventType.ACTION_START, (data) => {
      expect(toJSON(data)).toEqual({
        actionId: 0,
        actionName: 'doThis',
        executionId: 0,
        operatorId: 0,
        path: [],
        type: 'action',
      })
    })
    app.eventHub.once(EventType.ACTION_END, (data) => {
      expect(toJSON(data)).toEqual({
        actionId: 0,
        executionId: 0,
        actionName: 'doThis',
        operatorId: 0,
        path: [],
        type: 'action',
      })
    })
    app.actions.doThis()
  })
  test('should track operator start and end', () => {
    expect.assertions(2)
    const app = new Overmind({
      actions: {
        doThis() {},
      },
    })
    app.eventHub.once(EventType.OPERATOR_START, (data) => {
      expect(toJSON(data)).toEqual({
        actionId: 0,
        actionName: 'doThis',
        path: [],
        executionId: 0,
        operatorId: 0,
        type: 'action',
      })
    })
    app.eventHub.once(EventType.OPERATOR_END, (data) => {
      expect(toJSON(data)).toEqual({
        actionId: 0,
        actionName: 'doThis',
        path: [],
        isAsync: false,
        executionId: 0,
        operatorId: 0,
        type: 'action',
      })
    })
    app.actions.doThis()
  })
  test('should track mutations', () => {
    expect.assertions(1)
    const app = createDefaultOvermind()
    app.eventHub.once(EventType.MUTATIONS, (data) => {
      expect(toJSON(data)).toEqual({
        actionId: 2,
        actionName: 'changeFoo',
        mutations: [
          {
            args: ['bar2'],
            method: 'set',
            path: 'foo',
          },
        ],
        executionId: 0,
        operatorId: 0,
        path: [],
        type: 'action',
      })
    })
    app.actions.changeFoo()
  })
  test('should track async mutations', () => {
    expect.assertions(1)
    const app = createDefaultOvermind()
    app.eventHub.on(EventType.MUTATIONS, (data) => {
      expect(toJSON(data)).toEqual({
        actionId: 5,
        actionName: 'waitAndChangeFoo',
        mutations: [
          {
            args: ['bar2'],
            method: 'set',
            path: 'foo',
          },
        ],
        executionId: 0,
        operatorId: 0,
        path: [],
        type: 'action',
      })
    })
    app.actions.waitAndChangeFoo()
  })
  test('should track async mutations with async await', () => {
    expect.assertions(1)
    const app = createDefaultOvermind()
    app.eventHub.on(EventType.MUTATIONS, (data) => {
      expect(toJSON(data)).toEqual({
        actionId: 0,
        actionName: 'asyncChangeFoo',
        mutations: [
          {
            args: ['bar2'],
            method: 'set',
            path: 'foo',
          },
        ],
        executionId: 0,
        operatorId: 0,
        path: [],
        type: 'action',
      })
    })
    app.actions.asyncChangeFoo()
  })
  test('should instantiate app with modules', () => {
    const foo = {
      state: {
        foo: 'bar',
      },
      actions: {
        foo() {},
      },
    }
    const bar = {
      state: {
        bar: 'baz',
      },
      effects: {
        hello: () => 'hello',
      },
      actions: {
        bar() {},
      },
    }

    const config = Object.assign(
      {},
      namespaced({
        foo,
        bar,
      })
    )

    const app = new Overmind(config)

    expect(app.state.foo.foo).toEqual('bar')
    expect(app.state.bar.bar).toEqual('baz')
    expect(typeof app.actions.foo.foo).toBe('function')
    expect(typeof app.actions.bar.bar).toBe('function')
  })
  test('should instantiate modules with onInitialize', () => {
    const result: string[] = []
    const app = new Overmind(
      namespaced({
        foo: {
          onInitialize: () => {
            result.push('foo')
          },
        },
        bar: {
          onInitialize: () => {
            result.push('bar')
          },
        },
      })
    )

    return app.initialized.then(() => {
      expect(result).toEqual(['foo', 'bar'])
    })
  })
  test('should allow mutations on passed values', () => {
    expect.assertions(2)
    const app = createDefaultOvermind()
    expect(() => app.actions.changeValue(app.state.item)).not.toThrow()
    expect(app.state.item.isAwesome).toBe(false)
  })
  test('should allow mutations on passed values in object', () => {
    expect.assertions(2)
    const app = createDefaultOvermind()
    expect(() =>
      app.actions.changeFormValue({
        form: app.state.item,
        key: 'isAwesome',
        value: false,
      })
    ).not.toThrow()
    expect(app.state.item.isAwesome).toBe(false)
  })
})
