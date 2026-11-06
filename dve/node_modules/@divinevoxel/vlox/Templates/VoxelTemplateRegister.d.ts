import { IVoxelSelection, IVoxelSelectionConstructor, IVoxelSelectionData } from "./Selection/VoxelSelection";
import { IVoxelTemplate, IVoxelTemplateConstructor, IVoxelTemplateData } from "./VoxelTemplates.types";
export declare class VoxelTemplateRegister {
    static _templates: Map<string, IVoxelTemplateConstructor<any, any>>;
    static _selections: Map<string, IVoxelSelectionConstructor<any, any>>;
    static register(id: string, constructor: IVoxelTemplateConstructor<any>): void;
    static create<Template extends IVoxelTemplate>(data: IVoxelTemplateData<any>): Template;
    static registerSelection(id: string, constructor: IVoxelSelectionConstructor<any>): void;
    static createSelection<Selection extends IVoxelSelection>(data: IVoxelSelectionData<any>): Selection;
}
