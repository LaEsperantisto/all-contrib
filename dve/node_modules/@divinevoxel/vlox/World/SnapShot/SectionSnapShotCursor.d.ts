import { Vector3Like } from "@amodx/math";
import { DataCursorInterface } from "../../Voxels/Cursor/DataCursor.interface";
import { SectionSnapShot } from "./SectionSnapShot";
import { Sector } from "../Sector";
import { SectorCursor } from "../Cursor/SectorCursor";
import { SectionCursor } from "../Cursor/SectionCursor";
import { BoundingBox } from "@amodx/math/Geometry/Bounds/BoundingBox";
export declare class SectionSnapshotCursor implements DataCursorInterface {
    origin: Vector3Like;
    sectorOrigin: Vector3Like;
    dimension: number;
    volumeBounds: BoundingBox;
    sectors: Sector[];
    cursors: SectorCursor[];
    private invSectorSizeX;
    private invSectorSizeY;
    private invSectorSizeZ;
    constructor();
    private updateBounds;
    private _snapShot;
    private _centeralCursor;
    getCenteralCursor(): SectionCursor | null;
    setSectionSnapShot(snapShot: SectionSnapShot): void;
    protected getSectorIndex(x: number, y: number, z: number): number;
    inBounds(x: number, y: number, z: number): boolean;
    getVoxel(x: number, y: number, z: number): import("../Cursor/WorldVoxelCursor").WorldVoxelCursor | null;
    clone(): SectionSnapshotCursor;
}
