import { Vec3Array } from "@amodx/math";
import { VoxelMeshBVHStructCursor } from "./VoxelMeshBVHStructCursor";
import { FlatBinaryTreeIndex } from "../../../Util/FlatBinaryTreeIndex";
export declare class VoxelMeshBVHBuilder {
    static AABBStructByteSize: number;
    treeIndex: FlatBinaryTreeIndex;
    tree: Float32Array<ArrayBuffer>;
    structCursor: VoxelMeshBVHStructCursor;
    indices: Uint32Array<ArrayBuffer>;
    reset(): void;
    getMeshBounds(): {
        min: Vec3Array;
        max: Vec3Array;
    };
    updateVoxel(voxelX: number, voxelY: number, voxelZ: number, meshIndex: number, indicesStart: number, indicesEnd: number, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void;
}
