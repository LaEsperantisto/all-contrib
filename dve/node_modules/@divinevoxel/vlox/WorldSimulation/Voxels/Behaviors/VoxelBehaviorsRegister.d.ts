import { VoxelBehavior, VoxelBehaviorsData } from "./VoxelBehaviors";
export declare class VoxelBehaviorsRegister {
    static behaviors: Map<string, VoxelBehavior>;
    static register(data: VoxelBehaviorsData): void;
    static get(type: string): VoxelBehavior;
}
