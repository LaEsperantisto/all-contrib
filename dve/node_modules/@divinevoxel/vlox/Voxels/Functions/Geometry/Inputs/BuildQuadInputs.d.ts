import { VoxelModelData } from "../../../Models/VoxelModel.types";
import { VoxelModelInputs } from "../GeometryLUT.types";
import { BaseVoxelQuadData, VoxelGeometryData } from "../../../Geometry/VoxelGeometry.types";
import { VoxelGeometryTransform } from "../../../../Mesher/Geometry/Geometry.types";
export declare function BuildQuadInputs(args: any[], transform: VoxelGeometryTransform, data: VoxelModelInputs, quad: BaseVoxelQuadData, model: VoxelModelData, geometry: VoxelGeometryData): void;
