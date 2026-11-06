import { VoxelModelBuilder } from "./VoxelModelBuilder";
export declare class RenderedMaterials {
    static meshersMap: Map<string, VoxelModelBuilder>;
    static meshers: VoxelModelBuilder[];
    static init(): void;
}
