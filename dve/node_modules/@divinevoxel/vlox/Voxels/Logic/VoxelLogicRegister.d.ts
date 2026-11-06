import { VoxelLogic } from "./Classes/VoxelLogic";
import { VoxelLogicData } from "./VoxelLogic.types";
import { VoxelLogicTypeConstructor } from "./Classes/VoxelLogicType";
export declare class VoxelLogicRegister {
    static voxels: VoxelLogic[];
    static types: Map<string, VoxelLogicTypeConstructor<any>>;
    static get(id: string): VoxelLogicTypeConstructor<any>;
    static register(id: string, logicData: VoxelLogicData[]): void;
    static registerType(id: string, logic: VoxelLogicTypeConstructor<any>): void;
}
