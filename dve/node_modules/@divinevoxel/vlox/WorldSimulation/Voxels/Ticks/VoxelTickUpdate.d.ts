export declare class VoxelTickUpdate<Data extends any = null> {
    type: string;
    x: number;
    y: number;
    z: number;
    data: Data;
    constructor(type: string, x: number, y: number, z: number, data: Data);
}
