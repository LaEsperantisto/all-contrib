import { VoxelModelData } from "../VoxelModel.types";
import { VoxelGeometryData } from "../../Geometry/VoxelGeometry.types";
export type LiquidVoxelModelArgs = {
    stillTexture: number;
    flowTexture: number;
};
export declare const liquidGeometry: VoxelGeometryData;
export declare const liquidModel: VoxelModelData;
