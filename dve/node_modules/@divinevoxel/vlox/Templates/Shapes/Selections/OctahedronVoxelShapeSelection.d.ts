import { Vector3Like } from "@amodx/math";
import { BoundingBox } from "@amodx/math/Geometry/Bounds/BoundingBox";
import { IVoxelShapeSelection, IVoxelShapeSelectionData } from "./VoxelShapeSelection";
export interface OctahedronVoxelShapeSelectionData extends IVoxelShapeSelectionData<"octahedron-shape"> {
    width: number;
    height: number;
    depth: number;
}
export declare class OctahedronVoxelShapeSelection implements IVoxelShapeSelection<"octahedron-shape", OctahedronVoxelShapeSelectionData> {
    static readonly Type = "octahedron-shape";
    static CreateNew(data: Partial<OctahedronVoxelShapeSelectionData>): OctahedronVoxelShapeSelectionData;
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
    clone(): OctahedronVoxelShapeSelection;
    toJSON(): OctahedronVoxelShapeSelectionData;
    fromJSON(data: OctahedronVoxelShapeSelectionData): void;
}
