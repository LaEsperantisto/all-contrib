import { Vector3Like } from "@amodx/math";
import { BoundingBox } from "@amodx/math/Geometry/Bounds/BoundingBox";
import { IVoxelShapeSelection, IVoxelShapeSelectionData } from "./VoxelShapeSelection";
export interface BoxVoxelShapeSelectionData extends IVoxelShapeSelectionData<"box-shape"> {
    width: number;
    height: number;
    depth: number;
}
export declare class BoxVoxelShapeSelection implements IVoxelShapeSelection<"box-shape", BoxVoxelShapeSelectionData> {
    static readonly Type = "box-shape";
    static CreateNew(data: Partial<BoxVoxelShapeSelectionData>): BoxVoxelShapeSelectionData;
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
    clone(): BoxVoxelShapeSelection;
    toJSON(): BoxVoxelShapeSelectionData;
    fromJSON(data: BoxVoxelShapeSelectionData): void;
}
