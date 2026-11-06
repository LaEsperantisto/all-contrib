import { Vec3Array, Vec4Array } from "@amodx/math";
import { QuadUVData } from "../../../../Geometry/Geometry.types";
import { VoxelFaces } from "../../../../../Math";
export type QuadVoxelGometryArgs = [
    enabled: boolean,
    texture: any,
    rotation: number,
    doubleSided: boolean,
    uvs: QuadUVData
];
declare enum ArgIndexes {
    Enabled = 0,
    Texture = 1,
    Rotation = 2,
    DoubleSided = 3,
    UVs = 4
}
export type CompiledQuadVoxelGeometryNode = {
    type: "quad";
    positions: [Vec3Array, Vec3Array, Vec3Array, Vec3Array];
    weights: [Vec4Array, Vec4Array, Vec4Array, Vec4Array];
    closestFace: VoxelFaces;
    trueFaceIndex?: number;
};
export declare class QuadVoxelGometryInputs {
    static ArgIndexes: typeof ArgIndexes;
    static CreateArgs(): QuadVoxelGometryArgs;
}
export {};
