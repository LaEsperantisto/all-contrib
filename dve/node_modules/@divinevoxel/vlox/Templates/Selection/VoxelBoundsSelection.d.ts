import { Vector3Like } from "@amodx/math";
import { IVoxelSelection, IVoxelSelectionData } from "./VoxelSelection";
import { VoxelShapeTemplate } from "../Shapes/VoxelShapeTemplate";
import { IVoxelshapeTemplateBaseData } from "../Shapes/VoxelShapeTemplate.types";
import { DataCursorInterface } from "../../Voxels/Cursor/DataCursor.interface";
import { BoundingBox } from "@amodx/math/Geometry/Bounds/BoundingBox";
export interface VoxelBoundsSelectionData extends IVoxelSelectionData<"bounds"> {
}
export declare class VoxelBoundsSelection implements IVoxelSelection<"bounds", VoxelBoundsSelectionData> {
    origin: Vector3Like;
    end: Vector3Like;
    bounds: BoundingBox;
    isSelected(x: number, y: number, z: number): boolean;
    reConstruct(startPosition: Vector3Like, startNormal: Vector3Like, endPosition: Vector3Like, endNormal: Vector3Like, offset?: number): void;
    clone(): VoxelBoundsSelection;
    toTemplate(data?: Partial<IVoxelshapeTemplateBaseData>): VoxelShapeTemplate;
    toExtrudedTemplate(cursor: DataCursorInterface, normal: Vector3Like): void;
    toJSON(): VoxelBoundsSelectionData;
    fromJSON(data: VoxelBoundsSelectionData): void;
}
