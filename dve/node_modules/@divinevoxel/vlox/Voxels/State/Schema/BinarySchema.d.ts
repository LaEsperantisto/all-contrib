import { BinarySchemaNode } from "./BinarySchemaNode";
import { VoxelBinaryStateSchemaNode } from "../State.types";
type StateObject = (string | number)[];
export declare class BinarySchema {
    nodeMap: Map<string, BinarySchemaNode>;
    nodes: BinarySchemaNode[];
    constructor(schema: VoxelBinaryStateSchemaNode[]);
    private _value;
    toStateString(): string;
    readString(stateString: string): number;
    fromStateObject(stateObject: StateObject): number;
    getStateObject(stateValue: number): StateObject;
    compareString(stateString: string, ecnoded: number): boolean;
    startEncoding(value?: number): this;
    get(id: string): string | number;
    getNumber(id: string): number;
    getValue(id: string): string;
    setNumber(id: string, value: number): this;
    setValue(id: string, value: string): this;
    getEncoded(): number;
    getSchema(): VoxelBinaryStateSchemaNode[];
    totalStates(): number;
}
export {};
