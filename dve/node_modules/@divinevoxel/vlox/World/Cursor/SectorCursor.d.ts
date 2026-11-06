import type { Section } from "../Section/index";
import { Sector } from "../Sector/index";
import { WorldVoxelCursor } from "./WorldVoxelCursor";
import { Vector3Like } from "@amodx/math";
import { DataCursorInterface } from "../../Voxels/Cursor/DataCursor.interface";
import { WorldSectionCursorInterface } from "./WorldSectionCursor.interface";
import { BoundingBox } from "@amodx/math/Geometry/Bounds/BoundingBox";
export declare class SectorCursor implements DataCursorInterface, WorldSectionCursorInterface {
    _current: Sector | null;
    _section: Section | null;
    private voxel;
    _voxelIndex: number;
    _voxelPosition: Vector3Like;
    _sectorPosition: Vector3Like;
    volumeBounds: BoundingBox;
    get volumePosition(): Vector3Like;
    constructor();
    inBounds(x: number, y: number, z: number): boolean;
    setSector(sector: Sector): boolean;
    loadSector(dimension: number, x: number, y: number, z: number): boolean;
    getSection(x: number, y: number, z: number): Section | null;
    getVoxel(x: number, y: number, z: number): WorldVoxelCursor | null;
    getVoxelAtIndex(index: number): void;
    clone(): SectorCursor;
}
