import { VoxelModelData } from "../../../Models/VoxelModel.types";
import { VoxelModelInputs } from "../GeometryLUT.types";
import { BaseVoxelTriangleData, VoxelGeometryData } from "../../../Geometry/VoxelGeometry.types";
import { VoxelGeometryTransform } from "../../../../Mesher/Geometry/Geometry.types";
export declare function BuildTriangleInputs(args: any[], transform: VoxelGeometryTransform, data: VoxelModelInputs, tri: BaseVoxelTriangleData, model: VoxelModelData, geometry: VoxelGeometryData): void;
