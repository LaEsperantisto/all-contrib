import { Vector3Like } from "@amodx/math";
import { BoundingBox } from "@amodx/math/Geometry/Bounds/BoundingBox";
import { VoxelShapeShapeDirections } from "../VoxelShape.types";
import { IVoxelShapeSelection, IVoxelShapeSelectionData } from "./VoxelShapeSelection";
export interface PyramidVoxelShapeSelectionData extends IVoxelShapeSelectionData<"pyramid-shape"> {
    width: number;
    height: number;
    depth: number;
    fallOff: number;
    direction: VoxelShapeShapeDirections;
}
export declare class PyramidVoxelShapeSelection implements IVoxelShapeSelection<"pyramid-shape", PyramidVoxelShapeSelectionData> {
    static readonly Type = "pyramid-shape";
    static CreateNew(data: Partial<PyramidVoxelShapeSelectionData>): PyramidVoxelShapeSelectionData;
    origin: Vector3Like;
    bounds: BoundingBox;
    private _fallOff;
    get fallOff(): number;
    set fallOff(fallOFf: number);
    private _direction;
    get direction(): VoxelShapeShapeDirections;
    set direction(direction: VoxelShapeShapeDirections);
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
    clone(): PyramidVoxelShapeSelection;
    toJSON(): PyramidVoxelShapeSelectionData;
    fromJSON(data: PyramidVoxelShapeSelectionData): void;
}
