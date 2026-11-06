import { Vector3Like } from "@amodx/math";
import { IVoxelSelection, IVoxelSelectionData } from "./VoxelSelection";
import { VoxelShapeTemplate } from "../Shapes/VoxelShapeTemplate";
import { IVoxelshapeTemplateBaseData } from "../Shapes/VoxelShapeTemplate.types";
import { DataCursorInterface } from "../../Voxels/Cursor/DataCursor.interface";
import { BoundingBox } from "@amodx/math/Geometry/Bounds/BoundingBox";
export interface VoxelPointSelectionData extends IVoxelSelectionData<"point"> {
}
export declare class VoxelPointSelection implements IVoxelSelection<"point", VoxelPointSelectionData> {
    origin: Vector3Like;
    bounds: BoundingBox;
    isSelected(x: number, y: number, z: number): boolean;
    reConstruct(position: Vector3Like): void;
    clone(): VoxelPointSelection;
    toTemplate(data?: Partial<IVoxelshapeTemplateBaseData>): VoxelShapeTemplate;
    toExtrudedTemplate(cursor: DataCursorInterface, normal: Vector3Like): void;
    toJSON(): VoxelPointSelectionData;
    fromJSON(data: any): void;
}
