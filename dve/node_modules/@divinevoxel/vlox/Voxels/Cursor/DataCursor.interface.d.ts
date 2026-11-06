import { BoundingBox } from "@amodx/math/Geometry/Bounds/BoundingBox";
import { VoxelCursorInterface } from "./VoxelCursor.interface";
import { Vector3Like } from "@amodx/math";
export interface DataCursorInterface {
    volumeBounds: BoundingBox;
    volumePosition?: Vector3Like;
    getVoxel(x: number, y: number, z: number): VoxelCursorInterface | null;
    inBounds(x: number, y: number, z: number): boolean;
    clone(): DataCursorInterface;
}
