"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var EventType;
(function (EventType) {
    EventType["ACTION_START"] = "action:start";
    EventType["ACTION_END"] = "action:end";
    EventType["OPERATOR_START"] = "operator:start";
    EventType["OPERATOR_END"] = "operator:end";
    EventType["OPERATOR_ASYNC"] = "operator:async";
    EventType["MUTATIONS"] = "mutations";
    EventType["EFFECT"] = "effect";
    EventType["DERIVED"] = "derived";
    EventType["DERIVED_DIRTY"] = "derived:dirty";
    EventType["COMPONENT_ADD"] = "component:add";
    EventType["COMPONENT_UPDATE"] = "component:update";
    EventType["COMPONENT_REMOVE"] = "component:remove";
    EventType["GETTER"] = "getter";
})(EventType = exports.EventType || (exports.EventType = {}));
//# sourceMappingURL=internalTypes.js.map