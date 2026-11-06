import { VoxelModelData } from "../../../Models/VoxelModel.types";
import { VoxelModelInputs } from "../GeometryLUT.types";
import { VoxelCustomGeometryNode, VoxelGeometryData } from "../../../Geometry/VoxelGeometry.types";
import { VoxelGeometryTransform } from "../../../../Mesher/Geometry/Geometry.types";
export declare function BuildCustomInputs(args: any[], transform: VoxelGeometryTransform, data: VoxelModelInputs, custom: VoxelCustomGeometryNode, model: VoxelModelData, geometry: VoxelGeometryData): void;
