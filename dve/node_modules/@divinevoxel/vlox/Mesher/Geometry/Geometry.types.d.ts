import type { Vec2Array, Vec3Array } from "@amodx/math";
export interface VoxelGeometryTransform {
    position?: Vec3Array;
    scale?: Vec3Array;
    rotation?: Vec3Array;
    rotationPivot?: Vec3Array;
    lockUVs?: true;
    flip?: [flipX: 0 | 1, flipY: 0 | 1, flipZ: 0 | 1];
    divisor?: Vec3Array;
}
export type QuadVertexVec3Data = [Vec3Array, Vec3Array, Vec3Array, Vec3Array];
export type QuadVertexFloatData = [number, number, number, number];
export type QuadUVData = [Vec2Array, Vec2Array, Vec2Array, Vec2Array];
export declare const enum QuadVerticies {
    TopRight = 0,
    TopLeft = 1,
    BottomLeft = 2,
    BottomRight = 3
}
export declare const QuadVerticiesArray: QuadVerticies[];
export declare const enum TriangleVerticies {
    One = 0,
    Two = 1,
    Three = 2
}
export declare const TriangleVerticiesArray: TriangleVerticies[];
