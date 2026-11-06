import { DimensionSegment } from "../Dimensions/DimensionSegment";
import { BrushTool } from "../../Tools/Brush/Brush";
import { LocationData } from "../../Math";
import { IVoxelTemplate } from "../../Templates/VoxelTemplates.types";
import { VoxelUpdateData } from "../../Tasks/Tasks.types";
import { VoxelPath } from "../../Templates/Path/VoxelPath";
import { IVoxelSelection } from "../../Templates/Selection/VoxelSelection";
export declare class SimulationBrush extends BrushTool {
    _dimension: DimensionSegment;
    private taskTool;
    _location: LocationData;
    _mapLocation(): void;
    constructor(_dimension: DimensionSegment);
    paint(updateData?: VoxelUpdateData): this;
    paintAsync(updateData?: VoxelUpdateData): Promise<void>;
    paintTemplate(voxelTemplate: IVoxelTemplate, updateData?: VoxelUpdateData): this;
    paintTemplateAsync(voxelTemplate: IVoxelTemplate, updateData?: VoxelUpdateData): Promise<this>;
    paintPath(voxelPath: VoxelPath, updateData?: VoxelUpdateData): this;
    paintPathAsync(voxelPath: VoxelPath, updateData?: VoxelUpdateData): Promise<this>;
    erase(updateData?: VoxelUpdateData): this;
    eraseAsync(updateData?: VoxelUpdateData): Promise<void>;
    eraseTemplate(voxelTemplate: IVoxelTemplate, updateData?: VoxelUpdateData): this;
    eraseTemplateAsync(voxelTemplate: IVoxelTemplate, updateData?: VoxelUpdateData): Promise<this>;
    eraseSelection(selection: IVoxelSelection, updateData?: VoxelUpdateData): this;
    eraseSelectionAsync(selection: IVoxelSelection, updateData?: VoxelUpdateData): Promise<this>;
    erasePath(voxelPath: VoxelPath, updateData?: VoxelUpdateData): this;
    erasePathAsync(voxelPath: VoxelPath, updateData?: VoxelUpdateData): Promise<this>;
}
