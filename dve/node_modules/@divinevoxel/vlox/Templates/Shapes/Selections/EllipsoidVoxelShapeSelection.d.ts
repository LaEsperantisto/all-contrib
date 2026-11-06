import { Vector3Like } from "@amodx/math";
import { BoundingBox } from "@amodx/math/Geometry/Bounds/BoundingBox";
import { IVoxelShapeSelection, IVoxelShapeSelectionData } from "./VoxelShapeSelection";
export interface EllipsoidVoxelShapeSelectionData extends IVoxelShapeSelectionData<"ellipsoid-shape"> {
    radiusX: number;
    radiusY: number;
    radiusZ: number;
}
export declare class EllipsoidVoxelShapeSelection implements IVoxelShapeSelection<"ellipsoid-shape", EllipsoidVoxelShapeSelectionData> {
    static readonly Type = "ellipsoid-shape";
    static CreateNew(data: Partial<EllipsoidVoxelShapeSelectionData>): EllipsoidVoxelShapeSelectionData;
    origin: Vector3Like;
    bounds: BoundingBox;
    private _radiusX;
    get radiusX(): number;
    set radiusX(radius: number);
    private _radiusY;
    get radiusY(): number;
    set radiusY(radius: number);
    private _radiusZ;
    get radiusZ(): number;
    set radiusZ(radius: number);
    private _updateBounds;
    isSelected(x: number, y: number, z: number): boolean;
    clone(): EllipsoidVoxelShapeSelection;
    toJSON(): EllipsoidVoxelShapeSelectionData;
    fromJSON(data: EllipsoidVoxelShapeSelectionData): void;
}
