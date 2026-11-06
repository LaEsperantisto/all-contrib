import { VoxelModelData } from "../../Models/VoxelModel.types";
import { VoxelData } from "../../Types/Voxel.types";
import { VoxelGeometryData } from "../../Geometry/VoxelGeometry.types";
type FinalMappedVoxelInputs = Record<string, Record<string, number>>;
export declare function BuildGeomeetryLUT(voxels: VoxelData[], geomtries: VoxelGeometryData[], models: VoxelModelData[]): {
    finalModelStateMap: Map<string, Record<string, number>>;
    finalModelConditionalMap: Map<string, Record<string, number>>;
    finalVoxelStateInputMap: Map<string, FinalMappedVoxelInputs>;
    finalVoxelConditionalInputMap: Map<string, FinalMappedVoxelInputs>;
};
export {};
