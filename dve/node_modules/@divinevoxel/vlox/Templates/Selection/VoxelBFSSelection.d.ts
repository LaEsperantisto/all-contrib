import { Flat3DIndex, Vector3Like } from "@amodx/math";
import { IVoxelSelection, IVoxelSelectionData } from "./VoxelSelection";
import { DataCursorInterface } from "../../Voxels/Cursor/DataCursor.interface";
import { FullVoxelTemplate } from "../Full/FullVoxelTemplate";
import { BoundingBox } from "@amodx/math/Geometry/Bounds/BoundingBox";
export interface VoxelBFSSelectionData extends IVoxelSelectionData<"bfs"> {
    bitIndex: Uint8Array;
}
export declare class VoxelBFSSelection implements IVoxelSelection<"bfs", VoxelBFSSelectionData> {
    origin: Vector3Like;
    bitIndex: Uint8Array;
    index: Flat3DIndex;
    bounds: BoundingBox;
    isSelected(x: number, y: number, z: number): boolean;
    reConstruct(cursor: DataCursorInterface, position: Vector3Like, maxSize?: number): false | undefined;
    toTemplate(cursor: DataCursorInterface): FullVoxelTemplate;
    clone(): VoxelBFSSelection;
    toJSON(): VoxelBFSSelectionData;
    fromJSON(data: VoxelBFSSelectionData): void;
}
