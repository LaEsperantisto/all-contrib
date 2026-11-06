import { Flat3DIndex, Vec3Array } from "@amodx/math";
export declare class VoxelRelativeCubeIndex {
    static flatIndex: Flat3DIndex;
    static getIndex(x: number, y: number, z: number): number;
}
export declare const VoxelRelativeCubeIndexPositionMap: Record<number, Vec3Array>;
