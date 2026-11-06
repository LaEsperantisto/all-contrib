import { VoxelModelData } from "./Models/VoxelModel.types";
import { VoxelGeometryData } from "./Geometry/VoxelGeometry.types";
import { VoxelData } from "./Types/Voxel.types";
import { VoxelMaterialData } from "./Types/VoxelMaterial.types";
import { VoxelSubstanceData } from "./Types/VoxelSubstances.types";
import { CompiledvVxelTags } from "./Types/VoxelModelCompiledData.types";
export type InitVoxelDataProps = {
    geometry?: VoxelGeometryData[];
    models?: VoxelModelData[];
    voxels: VoxelData[];
    materials?: VoxelMaterialData[];
    substances?: VoxelSubstanceData[];
};
export declare function InitVoxelData(data: InitVoxelDataProps): CompiledvVxelTags;
