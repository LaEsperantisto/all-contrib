export declare class NumberPalette {
    private _count;
    _palette: number[];
    _map: Record<number, number>;
    get size(): number;
    constructor(inital?: ArrayLike<number>);
    register(value: number): number;
    get(): number[];
    getMap(): Record<number, number>;
    isRegistered(id: number): boolean;
    getId(value: number): number;
    getValue(id: number): number;
}
