export declare function compressBinaryObject(object: any): Promise<ArrayBuffer>;
export declare function expandBinaryObject<T = any>(buffer: ArrayBuffer | Uint8Array, useSharedMemory?: boolean): Promise<T>;
