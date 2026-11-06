import { BinaryBufferFormat } from "../BinaryBuffer.types";
export declare function ReadBufferAtIndex(source: Uint8Array | Uint16Array, format: BinaryBufferFormat, index: number): number;
export declare function SetBufferAtIndex(source: Uint8Array | Uint16Array, format: BinaryBufferFormat, index: number, value: number): number | void;
