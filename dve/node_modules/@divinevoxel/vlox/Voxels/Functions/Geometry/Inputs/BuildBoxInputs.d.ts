import { VoxelModelData } from "../../../Models/VoxelModel.types";
import { VoxelModelInputs } from "../GeometryLUT.types";
import { VoxelBoxGeometryNode, VoxelGeometryData } from "../../../Geometry/VoxelGeometry.types";
import { VoxelGeometryTransform } from "../../../../Mesher/Geometry/Geometry.types";
export declare function BuildBoxInputs(args: any[], transform: VoxelGeometryTransform, data: VoxelModelInputs, box: VoxelBoxGeometryNode, model: VoxelModelData, geometry: VoxelGeometryData): void;
