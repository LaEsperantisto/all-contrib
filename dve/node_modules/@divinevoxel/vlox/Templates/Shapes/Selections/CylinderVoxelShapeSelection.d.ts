import { Vector3Like } from "@amodx/math";
import { BoundingBox } from "@amodx/math/Geometry/Bounds/BoundingBox";
import { IVoxelShapeSelection, IVoxelShapeSelectionData } from "./VoxelShapeSelection";
export interface CylinderVoxelShapeSelectionData extends IVoxelShapeSelectionData<"cylinder-shape"> {
    width: number;
    height: number;
    depth: number;
}
export declare class CylinderVoxelShapeSelection implements IVoxelShapeSelection<"cylinder-shape", CylinderVoxelShapeSelectionData> {
    static readonly Type = "cylinder-shape";
    static CreateNew(data: Partial<CylinderVoxelShapeSelectionData>): CylinderVoxelShapeSelectionData;
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
    clone(): CylinderVoxelShapeSelection;
    toJSON(): CylinderVoxelShapeSelectionData;
    fromJSON(data: CylinderVoxelShapeSelectionData): void;
}
