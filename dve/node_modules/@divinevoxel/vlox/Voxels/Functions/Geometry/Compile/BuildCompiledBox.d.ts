import { VoxelGeometryTransform } from "../../../../Mesher/Geometry/Geometry.types";
import { CompiledQuadVoxelGeometryNode } from "Mesher/Voxels/Models/Nodes/Types/QuadVoxelGometryNodeTypes";
import { VoxelBoxGeometryNode } from "../../../Geometry/VoxelGeometry.types";
export declare function BuildCompiledBox(buildRules: boolean, data: VoxelBoxGeometryNode, transform: VoxelGeometryTransform): CompiledQuadVoxelGeometryNode[];
