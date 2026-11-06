import { Vec3Array } from "@amodx/math";
import { VoxelGeometryTransform } from "../../../../Mesher/Geometry/Geometry.types";
import { CompiledQuadVoxelGeometryNode } from "../../../../Mesher/Voxels/Models/Nodes/Types/QuadVoxelGometryNodeTypes";
export declare function BuildCompiledQuad(buildRules: boolean, points: [Vec3Array, Vec3Array, Vec3Array, Vec3Array], transform?: VoxelGeometryTransform): CompiledQuadVoxelGeometryNode;
