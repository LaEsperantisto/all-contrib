import { Vector3Like } from "@amodx/math";
import { BoundingBox } from "@amodx/math/Geometry/Bounds/BoundingBox";
import { IVoxelShapeSelection, IVoxelShapeSelectionData } from "./VoxelShapeSelection";
export interface ConeVoxelShapeSelectionData extends IVoxelShapeSelectionData<"cone-shape"> {
    width: number;
    height: number;
    depth: number;
}
export declare class ConeVoxelShapeSelection implements IVoxelShapeSelection<"cone-shape", ConeVoxelShapeSelectionData> {
    static readonly Type = "cone-shape";
    static CreateNew(data: Partial<ConeVoxelShapeSelectionData>): ConeVoxelShapeSelectionData;
    origin: Vector3Like;
    bounds: BoundingBox;
    _width: number;
    get width(): number;
    set width(width: number);
    _height: number;
    get height(): number;
    set height(height: number);
    _depth: number;
    get depth(): number;
    set depth(depth: number);
    private _updateBounds;
    isSelected(x: number, y: number, z: number): boolean;
    clone(): ConeVoxelShapeSelection;
    toJSON(): ConeVoxelShapeSelectionData;
    fromJSON(data: ConeVoxelShapeSelectionData): void;
}
