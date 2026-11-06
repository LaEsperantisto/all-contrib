import { Vec3Array } from "@amodx/math";
import { VoxelGeometryTransform } from "../../../../Mesher/Geometry/Geometry.types";
import { CompiledTriangleVoxelGeometryNode } from "../../../../Mesher/Voxels/Models/Nodes/Types/TriangleVoxelGometryNodeTypes";
export declare function BuildCompiledTri(buildRules: boolean, points: [Vec3Array, Vec3Array, Vec3Array], transform: VoxelGeometryTransform): CompiledTriangleVoxelGeometryNode;
