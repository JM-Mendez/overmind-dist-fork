import { VALUE, IS_PROXY, TrackStateTree, } from 'proxy-state-tree';
import { EventType } from './internalTypes';
export class Derived {
    constructor(cb) {
        this.cb = cb;
        this.isDirty = true;
        this.updateCount = 0;
        return this.evaluate.bind(this);
    }
    evaluate(eventHub, proxyStateTree, path) {
        if (!this.trackStateTree) {
            this.trackStateTree = proxyStateTree.getTrackStateTree();
            const pathAsArray = path.split('.');
            pathAsArray.pop();
            const parent = pathAsArray.reduce((curr, key) => curr[key], this.trackStateTree.state);
            this.scope = () => this.cb(parent, this.trackStateTree.state);
            proxyStateTree.onMutation((_, paths, flushId) => {
                if (this.isDirty) {
                    return;
                }
                for (let path of paths) {
                    if (this.paths.has(path)) {
                        eventHub.emitAsync(EventType.DERIVED_DIRTY, {
                            path,
                            flushId,
                        });
                        this.isDirty = true;
                        return;
                    }
                }
            });
        }
        if (this.isDirty ||
            (this.value &&
                this.value[IS_PROXY] &&
                this.value[VALUE][proxyStateTree.PROXY] !== this.value)) {
            this.value = this.trackStateTree.trackScope(this.scope);
            this.isDirty = false;
            this.paths = new Set(this.trackStateTree.pathDependencies);
            eventHub.emitAsync(EventType.DERIVED, {
                path,
                paths: Array.from(this.paths),
                updateCount: this.updateCount,
                value: this.value,
            });
            this.updateCount++;
        }
        // Tracks the paths for the consumer of this derived value
        for (let path of this.paths) {
            const currentTree = proxyStateTree.currentTree;
            if (currentTree instanceof TrackStateTree) {
                currentTree.addTrackingPath(path);
            }
        }
        return this.value;
    }
}
//# sourceMappingURL=derived.js.map