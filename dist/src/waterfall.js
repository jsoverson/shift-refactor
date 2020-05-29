"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waterfallMap = void 0;
function waterfallMap(array, iterator) {
    const reducer = (accumulator, next, i) => {
        const a = accumulator.then(result => iterator(next, i).then(newNode => result.concat(newNode)));
        return a;
    };
    const waterfall = array.reduce(reducer, Promise.resolve([]));
    return waterfall;
}
exports.waterfallMap = waterfallMap;
//# sourceMappingURL=waterfall.js.map