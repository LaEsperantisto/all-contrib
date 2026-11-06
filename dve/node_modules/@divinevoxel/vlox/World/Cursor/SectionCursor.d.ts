import { WorldVoxelCursor } from "./WorldVoxelCursor";
import { Vector3Like } from "@amodx/math";
import { DataCursorInterface } from "../../Voxels/Cursor/DataCursor.interface";
import { WorldSectionCursorInterface } from "./WorldSectionCursor.interface";
import type { Section } from "../Section/index";
import { BoundingBox } from "@amodx/math/Geometry/Bounds/BoundingBox";
export declare class SectionCursor implements WorldSectionCursorInterface, DataCursorInterface {
    _section: Section | null;
    private voxel;
    _voxelIndex: number;
    _voxelPosition: Vector3Like;
    _sectionPosition: Vector3Like;
    volumeBounds: BoundingBox;
    get volumePosition(): Vector3Like;
    constructor();
    inBounds(x: number, y: number, z: number): boolean;
    setSection(section: Section): void;
    loadSection(dimension: number, x: number, y: number, z: number): boolean;
    getVoxelAtIndex(index: number): WorldVoxelCursor;
    getVoxel(x: number, y: number, z: number): WorldVoxelCursor | null;
    clone(): SectionCursor;
}
