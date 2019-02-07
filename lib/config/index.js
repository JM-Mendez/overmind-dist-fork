"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
function merge(...configurations) {
    const initializers = configurations.reduce((aggr, config) => config.onInitialize ? aggr.concat(config.onInitialize) : aggr, []);
    return configurations.reduce((aggr, config) => {
        return {
            onInitialize: aggr.onInitialize,
            state: Object.assign({}, aggr.state, config.state),
            effects: Object.assign({}, aggr.effects, config.effects),
            actions: Object.assign({}, aggr.actions, config.actions),
        };
    }, {
        onInitialize: initializers.length
            ? (context) => Promise.all(initializers.map((cb) => cb(context)))
            : undefined,
        state: {},
        effects: {},
        actions: {},
    });
}
exports.merge = merge;
function parseNamespacedConfig(result, name, config) {
    const { actions, effects, onInitialize, state } = config;
    if (actions) {
        result.actions[name] = actions;
    }
    if (effects) {
        result.effects[name] = effects;
    }
    if (state) {
        result.state[name] = state;
    }
    if (onInitialize) {
        result.initializers.push(onInitialize);
    }
}
function namespaced(namespaces) {
    const result = {
        initializers: [],
        actions: {},
        effects: {},
        state: {},
    };
    Object.keys(namespaces).forEach((name) => {
        parseNamespacedConfig(result, name, namespaces[name]);
    });
    return Object.assign({
        actions: result.actions,
        effects: result.effects,
        state: result.state,
    }, result.initializers.length
        ? {
            onInitialize: (context) => Promise.all(result.initializers.map((cb) => cb(context))),
        }
        : {});
}
exports.namespaced = namespaced;
function lazy(configurations) {
    let app;
    return {
        onInitialize({ value }) {
            app = value;
        },
        effects: {
            lazy: {
                loadConfig(config) {
                    return app.actions.lazy.loadConfig(config);
                },
            },
        },
        actions: {
            lazy: {
                loadConfig(_a) {
                    var { value: key, state } = _a, rest = tslib_1.__rest(_a, ["value", "state"]);
                    const configToLoad = configurations[key];
                    configToLoad().then((loadedConfig) => {
                        const newConfig = namespaced({
                            [key]: loadedConfig,
                        });
                        if (newConfig.state && newConfig.state[key])
                            state[key] = newConfig.state[key];
                        if (newConfig.effects && newConfig.effects[key])
                            app.effects[key] = newConfig.effects[key];
                        if (newConfig.actions && newConfig.actions[key])
                            app.actions[key] = app.getActions(newConfig.actions[key]);
                        if (newConfig.onInitialize)
                            newConfig.onInitialize(Object.assign({ value: app, state }, rest));
                    });
                },
            },
        },
    };
}
exports.lazy = lazy;
//# sourceMappingURL=index.js.map