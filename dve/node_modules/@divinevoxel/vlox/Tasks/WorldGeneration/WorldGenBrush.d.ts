import type { Vec3Array } from "@amodx/math";
import { BrushTool } from "../../Tools/Brush/Brush.js";
import { VoxelUpdateTask } from "../VoxelUpdateTask.js";
import { RawVoxelData } from "Voxels/index.js";
export declare class WorldGenBrush extends BrushTool {
    constructor();
    requestsId: "";
    tasks: VoxelUpdateTask;
    start(dimension: number, x: number, y: number, z: number): this;
    paintRaw(raw: RawVoxelData): this;
    paint(): this;
    getUpdatedSections(): Vec3Array[];
    update(): false | undefined;
    erase(): this;
    runUpdates(): void;
    worldAlloc(start: Vec3Array, end: Vec3Array): Promise<any>;
    worldDealloc(start: Vec3Array, end: Vec3Array): Promise<any>;
}
