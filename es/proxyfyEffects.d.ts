export declare const doNotProxy: unique symbol;
export declare function proxifyEffects<Effects>(effects: Effects, cb: (effect: any) => void): Effects;
