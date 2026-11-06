import { Vector3Like } from "@amodx/math";
import { SectorCursor } from "./SectorCursor";
import { DataCursorInterface } from "../../Voxels/Cursor/DataCursor.interface";
import { BoundingBox } from "@amodx/math/Geometry/Bounds/BoundingBox";
export declare class WorldCursor implements DataCursorInterface {
    sectorCursors: Map<number, Map<number, SectorCursor>>;
    activeCursors: SectorCursor[];
    origin: Vector3Like;
    dimension: number;
    _sectorPowerX: number;
    _sectorPowerY: number;
    _sectorPowerZ: number;
    _minX: number;
    _minY: number;
    _minZ: number;
    _maxX: number;
    _maxY: number;
    _maxZ: number;
    volumeBounds: BoundingBox;
    constructor();
    private updateBounds;
    setFocalPoint(dimension: number, x: number, y: number, z: number): void;
    inBounds(x: number, y: number, z: number): boolean;
    getSector(x: number, y: number, z: number): SectorCursor | null;
    getVoxel(x: number, y: number, z: number): import("./WorldVoxelCursor").WorldVoxelCursor | null;
    clone(): WorldCursor;
}
