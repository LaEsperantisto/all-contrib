import { VoxelData } from "../Types/Voxel.types";
import { VoxelMaterialData } from "../Types/VoxelMaterial.types";
import { VoxelSubstanceData } from "../Types/VoxelSubstances.types";
import { CompiledvVxelTags } from "../Types/VoxelModelCompiledData.types";
import { VoxelModelData } from "../../Voxels/Models/VoxelModel.types";
export type BuildTagDataProps = {
    voxels: VoxelData[];
    models: VoxelModelData[];
    voxelsOverrides?: Record<string, (value: any) => any>;
    substances: VoxelSubstanceData[];
    substancesOverrides?: Record<string, (value: any) => any>;
    materials: VoxelMaterialData[];
    materialsOverrides?: Record<string, (value: any) => any>;
};
export declare function BuildTagAndPaletteData(props: BuildTagDataProps): CompiledvVxelTags;
