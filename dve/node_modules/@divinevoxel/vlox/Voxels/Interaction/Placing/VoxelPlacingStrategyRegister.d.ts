import { VoxelPlacingStrategyData } from "./VoxelPlacingStrategy.types";
import { VoxelModelPlacingStrategy } from "./VoxelPlacingStrategy";
export declare class VoxelPlacingStrategyRegister {
    static _stragies: Map<string, VoxelModelPlacingStrategy>;
    static register(id: string, data: VoxelPlacingStrategyData[] | string): void;
    static get(id: string): VoxelModelPlacingStrategy | null;
}
