import { VoxelLogicEffects, VoxelLogicPoweredData } from "../../VoxelLogic.types";
import { VoxelCursorInterface } from "../../../Cursor/VoxelCursor.interface";
import { VoxelLogicType } from "../VoxelLogicType";
export declare class VoxelLogicPoweredType extends VoxelLogicType<VoxelLogicPoweredData> {
    init(): void;
    run(voxel: VoxelCursorInterface): boolean;
    getEffects(): Generator<VoxelLogicEffects>;
}
