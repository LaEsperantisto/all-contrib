import { DimensionSimulation } from "../../Dimensions/DimensionSimulation";
import { VoxelCursorInterface } from "../../../Voxels/Cursor/VoxelCursor.interface";
export interface VoxelBehaviorsData {
    type: string;
    inherits?: string;
    needUpdate?(simulation: DimensionSimulation, voxel: VoxelCursorInterface, x: number, y: number, z: number): boolean;
    onInteract?(simulation: DimensionSimulation, voxel: VoxelCursorInterface, x: number, y: number, z: number): void;
    onPaint?(simulation: DimensionSimulation, voxel: VoxelCursorInterface, x: number, y: number, z: number): void;
    onErase?(simulation: DimensionSimulation, voxel: VoxelCursorInterface, x: number, y: number, z: number): void;
    onTick?(simulation: DimensionSimulation, voxel: VoxelCursorInterface, x: number, y: number, z: number): void;
}
export declare class VoxelBehavior {
    data: VoxelBehaviorsData;
    constructor(data: VoxelBehaviorsData);
    needUpdate(simulation: DimensionSimulation, x: number, y: number, z: number): boolean | undefined;
    onInteract(simulation: DimensionSimulation, x: number, y: number, z: number): void;
    onPaint(simulation: DimensionSimulation, x: number, y: number, z: number): void;
    onErase(simulation: DimensionSimulation, x: number, y: number, z: number): void;
    onTick(simulation: DimensionSimulation, x: number, y: number, z: number): void;
}
