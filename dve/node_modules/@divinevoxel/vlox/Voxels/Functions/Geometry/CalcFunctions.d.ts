import { VoxelFaces } from "../../../Math";
import { Quad } from "../../../Mesher/Geometry";
import { QuadUVData, VoxelGeometryTransform } from "../../../Mesher/Geometry/Geometry.types";
import { Vec4Array } from "@amodx/math";
export declare function getVertexWeights(face: VoxelFaces, x: number, y: number, z: number): Vec4Array;
export type QuadVertexWeights = [Vec4Array, Vec4Array, Vec4Array, Vec4Array];
export declare const getQuadWeights: (quad: Quad, direction: VoxelFaces) => QuadVertexWeights;
export declare const mapQuadUvs: (uvs: Vec4Array, rotation: number | undefined, transform: VoxelGeometryTransform) => QuadUVData;
