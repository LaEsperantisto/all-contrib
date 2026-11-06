import { DimensionSegment } from "../Dimensions/DimensionSegment";
import { VoxelTickUpdate } from "../Voxels/Ticks/index";
export declare class TickQueue {
    dimension: DimensionSegment;
    constructor(dimension: DimensionSegment);
    ticks: Map<number, VoxelTickUpdate<null>[]>;
    getTotalTicks(): number;
    addTick(data: VoxelTickUpdate, delay?: number): void;
    private compareTick;
    run(): boolean;
}
