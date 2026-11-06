import { BinaryBufferCompresedTypes, BinaryBufferData, JSONBinaryBufferData } from "../BinaryBuffer.types";
export declare function BinaryBufferFromJSON(data: JSONBinaryBufferData): Promise<BinaryBufferData>;
export declare function BinaryBufferToJSON(data: BinaryBufferData, compression?: boolean | BinaryBufferCompresedTypes): Promise<JSONBinaryBufferData>;
