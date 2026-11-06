import { VoxelEffectConstructor } from "./VoxelEffect";
export declare class VoxelEffectRegister {
    static _effects: Map<string, VoxelEffectConstructor>;
    static register(...effects: VoxelEffectConstructor[]): void;
    static get(id: string): VoxelEffectConstructor;
}
