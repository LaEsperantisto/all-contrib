import { VoxelTickUpdateType, VoxelTickUpdateTypeData } from "./VoxelTickUpdateType";
export declare class VoxelTickUpdateRegister {
    static _types: Map<string, VoxelTickUpdateType<null>>;
    static getUpdateType(id: string): VoxelTickUpdateType<null>;
    static registerType(data: VoxelTickUpdateTypeData): void;
}
