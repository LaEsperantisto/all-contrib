import { TemplateVoxelCursor } from "./TemplateVoxelCursor";
import { DataCursorInterface } from "../../Voxels/Cursor/DataCursor.interface";
import { IVoxelTemplate } from "../../Templates/VoxelTemplates.types";
import { TemplateProxy } from "./TemplateProxy";
import { BoundingBox } from "@amodx/math/Geometry/Bounds/BoundingBox";
export declare class TemplateCursor implements DataCursorInterface {
    _voxelIndex: number;
    _proxy: TemplateProxy | null;
    private _airCursor;
    baseLightValue: number;
    private voxel;
    volumeBounds: BoundingBox;
    constructor();
    inBounds(x: number, y: number, z: number): boolean;
    setTemplate(template: IVoxelTemplate): void;
    getVoxel(x: number, y: number, z: number): TemplateVoxelCursor;
    clone(): DataCursorInterface;
}
