import { VoxelFaces } from "../../Math";
import { WorldCursor } from "../../World/Cursor/WorldCursor";
import { DimensionSegment } from "./DimensionSegment";
import { Vector3Like } from "@amodx/math";
import { PriorityQueue } from "../../Util/PriorityQueue";
import { VoxelUpdate } from "../Voxels/Behaviors";
import { SimulationBrush } from "../Tools/SimulationBrush";
declare class UpdatedBounds {
    displayMin: Vector3Like;
    displayMax: Vector3Like;
    dimension: number;
    start(dimension?: number): void;
    updateDisplay(x: number, y: number, z: number): void;
    markDisplayDirty(): boolean;
}
export declare class DimensionSimulation {
    dimension: DimensionSegment;
    private cursor;
    nDataCursor: WorldCursor;
    sDataCursor: WorldCursor;
    tickCursor: Record<VoxelFaces, WorldCursor>;
    bounds: UpdatedBounds;
    brush: SimulationBrush;
    updateQueue: PriorityQueue<VoxelUpdate>;
    constructor(dimension: DimensionSegment);
    setOrigin(x: number, y: number, z: number): void;
    getVoxelForUpdate(x: number, y: number, z: number): import("../../World/Cursor/WorldVoxelCursor").WorldVoxelCursor;
    scheduleUpdate(type: string, x: number, y: number, z: number, delay: number, data?: null): void;
}
export {};
