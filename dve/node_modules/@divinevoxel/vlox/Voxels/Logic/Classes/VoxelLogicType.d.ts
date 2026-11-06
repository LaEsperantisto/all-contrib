import { VoxelCursorInterface } from "../../../Voxels/Cursor/VoxelCursor.interface";
import { VoxelLogicEffects } from "../VoxelLogic.types";
import { VoxelLogic } from "./VoxelLogic";
export interface VoxelLogicTypeConstructor<Data> {
    new (voxelLogic: VoxelLogic, data: Data): VoxelLogicType<Data>;
}
export declare abstract class VoxelLogicType<Data> {
    voxelLogic: VoxelLogic;
    data: Data;
    constructor(voxelLogic: VoxelLogic, data: Data);
    abstract init(): void;
    abstract run(task: VoxelCursorInterface): boolean;
    abstract getEffects(): Generator<VoxelLogicEffects>;
}
