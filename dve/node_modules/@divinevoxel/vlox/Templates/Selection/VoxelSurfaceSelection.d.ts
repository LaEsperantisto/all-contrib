import { Flat3DIndex, Vector3Like } from "@amodx/math";
import { IVoxelSelection, IVoxelSelectionData } from "./VoxelSelection";
import { DataCursorInterface } from "../../Voxels/Cursor/DataCursor.interface";
import { PaintVoxelData } from "../../Voxels/Types/PaintVoxelData";
import { FullVoxelTemplate } from "../Full/FullVoxelTemplate";
import { BoundingBox } from "@amodx/math/Geometry/Bounds/BoundingBox";
export interface VoxelSurfaceSelectionData extends IVoxelSelectionData<"surface"> {
    normal: Vector3Like;
    bitIndex: Uint8Array;
}
export declare class VoxelSurfaceSelection implements IVoxelSelection<"surface"> {
    origin: Vector3Like;
    normal: Vector3Like;
    bitIndex: Uint8Array;
    index: Flat3DIndex;
    bounds: BoundingBox;
    isSelected(x: number, y: number, z: number): boolean;
    reConstruct(cursor: DataCursorInterface, position: Vector3Like, normal: Vector3Like, extrusion: number, maxSize?: number): boolean;
    clone(): VoxelSurfaceSelection;
    toTemplate(voxel: PaintVoxelData): FullVoxelTemplate;
    toJSON(): VoxelSurfaceSelectionData;
    fromJSON(data: VoxelSurfaceSelectionData): void;
}
