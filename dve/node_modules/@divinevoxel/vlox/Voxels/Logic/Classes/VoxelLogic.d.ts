import { VoxelCursorInterface } from "../../Cursor/VoxelCursor.interface";
import { VoxelLogicData } from "../VoxelLogic.types";
import { VoxelLogicType } from "./VoxelLogicType";
import { BinarySchema } from "../../State/Schema/BinarySchema";
export declare class VoxelLogic {
    voxelId: string;
    types: VoxelLogicType<any>[];
    effectedTags: Map<string, VoxelLogicType<any>[]>;
    schema: BinarySchema;
    constructor(voxelId: string, data: VoxelLogicData[]);
    getTagValue(tagId: string, cursor: VoxelCursorInterface): any;
    registerEffectOnTag(tagId: string, effect: VoxelLogicType<any>): void;
    hasTag(tag: string): boolean;
}
