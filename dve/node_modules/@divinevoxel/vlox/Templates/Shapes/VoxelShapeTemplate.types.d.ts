import { PaintVoxelData } from "../../Voxels/Types/PaintVoxelData";
import { IVoxelTemplateData } from "../VoxelTemplates.types";
import { IVoxelShapeSelectionData } from "./Selections/VoxelShapeSelection";
export interface IVoxelShapeTemplateEvents {
    updated: null;
}
export type VoxelShapeTemplateFillModes = "full" | "outline" | "shell";
export declare const VoxelShapeTemplateFillModesArray: VoxelShapeTemplateFillModes[];
export interface IVoxelshapeTemplateBaseData {
    fillVoxel: PaintVoxelData;
    faceVoxel: PaintVoxelData;
    edgeVoxel: PaintVoxelData;
    pointVoxel: PaintVoxelData;
    fillMode: VoxelShapeTemplateFillModes;
    shapeSelection: IVoxelShapeSelectionData<any>;
}
export interface VoxelShapeTemplateData extends IVoxelTemplateData<"shape">, IVoxelshapeTemplateBaseData {
}
