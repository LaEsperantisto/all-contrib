import { VoxelLogicEffects, VoxelLogicStateData } from "../../VoxelLogic.types";
import { VoxelCursorInterface } from "../../../Cursor/VoxelCursor.interface";
import { VoxelLogicType } from "../VoxelLogicType";
export declare class VoxelLogicStateType extends VoxelLogicType<VoxelLogicStateData> {
    keys: string[];
    init(): void;
    run(voxel: VoxelCursorInterface): boolean;
    getEffects(): Generator<VoxelLogicEffects>;
}
