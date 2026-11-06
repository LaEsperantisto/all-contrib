export declare class VoxelMeshBVHStructCursor {
    data: Float32Array;
    get minX(): number;
    get minY(): number;
    get minZ(): number;
    get maxX(): number;
    get maxY(): number;
    get maxZ(): number;
    get voxelIndex(): number;
    get active(): number;
    get nodeType(): number;
    trueIndex: number;
    private index;
    setIndex(index: number): void;
    constructor(data: Float32Array);
    setActive(): void;
    setVoxelIndex(value: number): void;
    setInnerNode(): void;
    setGeometryNode(): void;
    updateMin(x: number, y: number, z: number): void;
    updateMax(x: number, y: number, z: number): void;
}
