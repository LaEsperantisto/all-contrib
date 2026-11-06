import { Vector3Like } from "@amodx/math";
import { IVoxelSelection, IVoxelSelectionData } from "./VoxelSelection";
import { IVoxelTemplate, IVoxelTemplateData } from "../VoxelTemplates.types";
import { BoundingBox } from "@amodx/math/Geometry/Bounds/BoundingBox";
import type { VoxelTemplateRegister } from "../VoxelTemplateRegister";
export interface VoxelTemplateSelectionData extends IVoxelSelectionData<"template"> {
    template: IVoxelTemplateData<any>;
}
export declare class VoxelTemplateSelection implements IVoxelSelection<"template"> {
    static Register: typeof VoxelTemplateRegister;
    origin: Vector3Like;
    bounds: BoundingBox;
    template: IVoxelTemplate;
    isSelected(x: number, y: number, z: number): boolean;
    clone(): VoxelTemplateSelection;
    setTemplate(template: IVoxelTemplate): void;
    toJSON(): VoxelTemplateSelectionData;
    fromJSON(data: VoxelTemplateSelectionData): void;
}
