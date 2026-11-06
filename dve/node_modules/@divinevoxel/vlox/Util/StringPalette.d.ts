export declare class StringPalette {
    private _count;
    _palette: string[];
    _map: Record<string, number>;
    constructor(inital?: ArrayLike<string>);
    get size(): number;
    load(palette: string[]): void;
    register(string: string): number;
    get(): string[];
    getMap(): Record<string, number>;
    isRegistered(id: string): boolean;
    getNumberId(id: string): number;
    getStringId(id: number): string;
}
