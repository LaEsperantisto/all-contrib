import { Vec2Array, Vec3Array, Vec4Array } from "@amodx/math";
import { VoxelFaces } from "../../../../../Math";
export type TriangleVoxelGometryArgs = [
    enabled: boolean,
    texture: any,
    rotation: number,
    doubleSided: boolean,
    uvs: [v1: Vec2Array, v2: Vec2Array, v3: Vec2Array]
];
declare enum ArgIndexes {
    Enabled = 0,
    Texture = 1,
    Rotation = 2,
    DoubleSided = 3,
    UVs = 4
}
export type CompiledTriangleVoxelGeometryNode = {
    type: "triangle";
    positions: [Vec3Array, Vec3Array, Vec3Array];
    weights: [Vec4Array, Vec4Array, Vec4Array];
    closestFace: VoxelFaces;
    trueFaceIndex?: number;
};
export declare class TriangleVoxelGometryInputs {
    static ArgIndexes: typeof ArgIndexes;
    static CreateArgs(): TriangleVoxelGometryArgs;
}
export {};
