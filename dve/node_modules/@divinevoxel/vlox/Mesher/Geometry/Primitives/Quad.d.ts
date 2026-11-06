import { Vec2Array, Vec3Array } from "@amodx/math";
import { QuadVector2VertexData, QuadVector3VertexData } from "./QuadVertexData";
import { QuadUVData, QuadVerticies } from "../Geometry.types";
export declare class Quad {
    static FullUVs: Readonly<QuadUVData>;
    static RotateUvs(uvs: QuadUVData | Readonly<QuadUVData>, rotation: number): QuadUVData;
    static Create(positions?: [Vec3Array, Vec3Array, Vec3Array, Vec3Array], uvs?: [Vec2Array, Vec2Array, Vec2Array, Vec2Array], doubleSided?: boolean): Quad;
    static RotateVertices90Degrees(vertices: [QuadVerticies, QuadVerticies, QuadVerticies, QuadVerticies], times?: number): [QuadVerticies, QuadVerticies, QuadVerticies, QuadVerticies];
    static GetNormalRightHanded(p1: Vec3Array, p2: Vec3Array, p3: Vec3Array, p4: Vec3Array): [n1: Vec3Array, n2: Vec3Array, n3: Vec3Array, n4: Vec3Array];
    static GetNormalLeftHanded(p1: Vec3Array, p2: Vec3Array, p3: Vec3Array, p4: Vec3Array): [n1: Vec3Array, n2: Vec3Array, n3: Vec3Array, n4: Vec3Array];
    static OrderQuadVertices(vertices: [Vec3Array, Vec3Array, Vec3Array, Vec3Array], direction: "north" | "south" | "east" | "west" | "up" | "down"): [Vec3Array, Vec3Array, Vec3Array, Vec3Array];
    positions: QuadVector3VertexData;
    normals: QuadVector3VertexData;
    uvs: QuadVector2VertexData;
    bounds: [min: Vec3Array, max: Vec3Array];
    doubleSided: boolean;
    constructor(data: {
        positions?: [Vec3Array, Vec3Array, Vec3Array, Vec3Array];
        uvs?: [Vec2Array, Vec2Array, Vec2Array, Vec2Array];
        doubleSided?: boolean;
    });
    setUVs([v1, v2, v3, v4]: [
        v1: Vec2Array,
        v2: Vec2Array,
        v3: Vec2Array,
        v4: Vec2Array
    ]): this;
    setPositions(positions: [Vec3Array, Vec3Array, Vec3Array, Vec3Array]): this;
    clone(): Quad;
}
