import { Vec2Array, Vec3Array } from "@amodx/math";
import { TriangleVector2VertexData, TriangleVector3VertexData } from "./TriangleVertexData";
/**
 * Example "TriUVData" type for clarity:
 * export type TriUVData = [Vec2Array, Vec2Array, Vec2Array];
 *
 * Example "TriVertexVec3Data" type:
 * export type TriVertexVec3Data = [Vec3Array, Vec3Array, Vec3Array];
 */
export declare class Triangle {
    /**
     * A simple set of "full" UVs for a triangle, in whichever ordering convention you prefer.
     * Adapt this to your own standard. Below is just a quick example:
     */
    static FullUVs: Readonly<[Vec2Array, Vec2Array, Vec2Array]>;
    /**
     * Rotate triangle UVs about a pivot, defaulting to [0.5, 0.5] if you wish (or you can adapt).
     * This example matches the style of the Quad rotation.
     */
    static RotateUvs(uvs: [Vec2Array, Vec2Array, Vec2Array], rotation: number): [Vec2Array, Vec2Array, Vec2Array];
    /**
     * Factory method for creating a Tri instance.
     */
    static Create(positions?: [Vec3Array, Vec3Array, Vec3Array], uvs?: [Vec2Array, Vec2Array, Vec2Array], doubleSided?: boolean): Triangle;
    /**
     * Computes a right-handed normal for a triangle given three points p1, p2, p3.
     * The cross product is (p2 - p1) x (p3 - p1).
     * This returns a single normal, but we place it in a triple for each vertex
     * in case you want distinct normal per vertex.
     */
    static GetNormalRightHanded(p1: Vec3Array, p2: Vec3Array, p3: Vec3Array): [Vec3Array, Vec3Array, Vec3Array];
    /**
     * Computes a left-handed normal for a triangle. This is simply flipping the sign
     * of the right-handed normal (or reversing the cross).
     */
    static GetNormalLeftHanded(p1: Vec3Array, p2: Vec3Array, p3: Vec3Array): [Vec3Array, Vec3Array, Vec3Array];
    positions: TriangleVector3VertexData;
    normals: TriangleVector3VertexData;
    uvs: TriangleVector2VertexData;
    doubleSided: boolean;
    bounds: [min: Vec3Array, max: Vec3Array];
    constructor(data: {
        positions?: [Vec3Array, Vec3Array, Vec3Array];
        uvs?: [Vec2Array, Vec2Array, Vec2Array];
        doubleSided?: boolean;
    });
    setUVs([uv1, uv2, uv3]: [Vec2Array, Vec2Array, Vec2Array]): this;
    /**
     * Scales all positions of the triangle by the given x, y, z factors.
     */
    scale(x: number, y: number, z: number): this;
    /**
     * Translates all positions by (x, y, z).
     */
    transform(x: number, y: number, z: number): this;
    /**
     * Sets positions, computing a left-handed normal by default (matching your Quad).
     * Adapt if you need right-handed or detect it automatically.
     */
    setPositions(positions: [Vec3Array, Vec3Array, Vec3Array]): this;
    /**
     * Clones the triangle, copying position and UV data.
     */
    clone(): Triangle;
}
