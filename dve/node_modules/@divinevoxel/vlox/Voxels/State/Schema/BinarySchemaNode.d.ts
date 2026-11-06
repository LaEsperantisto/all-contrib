import { StringPalette } from "../../../Util/StringPalette";
import { VoxelBinaryStateSchemaNode } from "../State.types";
export declare class BinarySchemaNode {
    readonly data: VoxelBinaryStateSchemaNode;
    get name(): string;
    valuePalette?: StringPalette;
    bitIndex: number;
    bitMask: number;
    constructor(data: VoxelBinaryStateSchemaNode);
    getValue(data: number): number;
    setValue(data: number, value: number): number;
}
