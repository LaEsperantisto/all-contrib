import { Vec3Array } from "@amodx/math";
import { Quad } from "../../../../Mesher/Geometry/Primitives/Quad";
import { StringPalette } from "../../../../Util/StringPalette";
import { Triangle } from "../../../../Mesher/Geometry/Primitives/Triangle";
export declare class OcclusionFaceRegister {
    static faces: StringPalette;
    static faceIndex: ([
        type: 0,
        positions: [Vec3Array, Vec3Array, Vec3Array, Vec3Array],
        normals: [Vec3Array, Vec3Array, Vec3Array, Vec3Array]
    ] | [
        type: 1,
        positions: [Vec3Array, Vec3Array, Vec3Array],
        normals: [Vec3Array, Vec3Array, Vec3Array]
    ])[];
    static getQuadId(quad: Quad): number;
    static getTriangleId(triangle: Triangle): number;
}
