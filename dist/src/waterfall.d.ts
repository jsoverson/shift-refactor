export declare function waterfallMap<T, J>(array: Array<J>, iterator: (el: J, i: number) => Promise<T>): Promise<Array<T>>;
