import { VoxelCursorInterface } from "../../../Voxels/Cursor/VoxelCursor.interface";
import { VoxelTickUpdate } from "./VoxelTickUpdate";
import { DimensionSimulation } from "../../Dimensions/DimensionSimulation";
export interface VoxelTickUpdateTypeData<Data extends any = null> {
    type: string;
    run(runData: DimensionSimulation, voxel: VoxelCursorInterface, update: VoxelTickUpdate<Data>): void;
}
export declare class VoxelTickUpdateType<Data extends any = null> {
    data: VoxelTickUpdateTypeData<Data>;
    constructor(data: VoxelTickUpdateTypeData<Data>);
    run(runData: DimensionSimulation, update: VoxelTickUpdate<Data>): void;
}
