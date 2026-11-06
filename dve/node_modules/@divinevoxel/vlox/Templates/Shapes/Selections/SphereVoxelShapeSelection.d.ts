import { Vector3Like } from "@amodx/math";
import { BoundingBox } from "@amodx/math/Geometry/Bounds/BoundingBox";
import { IVoxelShapeSelection, IVoxelShapeSelectionData } from "./VoxelShapeSelection";
export interface SphereVoxelShapeSelectionData extends IVoxelShapeSelectionData<"sphere-shape"> {
    radius: number;
}
export declare class SphereVoxelShapeSelection implements IVoxelShapeSelection<"sphere-shape", SphereVoxelShapeSelectionData> {
    static readonly Type = "sphere-shape";
    static CreateNew(data: Partial<SphereVoxelShapeSelectionData>): SphereVoxelShapeSelectionData;
    origin: Vector3Like;
    bounds: BoundingBox;
    _radius: number;
    get radius(): number;
    set radius(radius: number);
    private _updateBounds;
    isSelected(x: number, y: number, z: number): boolean;
    clone(): SphereVoxelShapeSelection;
    toJSON(): SphereVoxelShapeSelectionData;
    fromJSON(data: SphereVoxelShapeSelectionData): void;
}
