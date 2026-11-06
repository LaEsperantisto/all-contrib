import { VoxelModelData } from "../Models/VoxelModel.types";
import { VoxelData } from "../Types/Voxel.types";
import { VoxelGeometryData } from "../Geometry/VoxelGeometry.types";
import { VoxelMaterialData } from "../Types/VoxelMaterial.types";
import { VoxelSubstanceData } from "../Types/VoxelSubstances.types";
export declare function BuildLUTs(materials: VoxelMaterialData[], substances: VoxelSubstanceData[], voxels: VoxelData[], geometry: VoxelGeometryData[], models: VoxelModelData[]): void;
