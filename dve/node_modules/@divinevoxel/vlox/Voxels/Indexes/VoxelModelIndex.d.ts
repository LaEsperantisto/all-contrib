import { CachedDisplayIndex } from "../../Cache/Cache.types";
import { CompactMeshData } from "../../Mesher/Types/Mesher.types";
export declare class VoxelModelIndex {
    static voxelModels: Map<string, Map<string, {
        model: CompactMeshData;
        material: string;
    }>>;
    static voxelMaterials: Map<string, Map<string, any>>;
    static registerModel(voxelId: string, namedStateId: string, model: CompactMeshData, materialId: string, material?: any): void;
    static registerMaterial(voxelId: string, namedStateId: string, material?: any): void;
    static getModel(voxelId: string, namedStateId: string): false | {
        model: CompactMeshData;
        material: string;
    };
    static getMaterial(voxelId: string, namedStateId: string): any;
    static loadData(data: CachedDisplayIndex["meshes"]): void;
    static cacheData(): CachedDisplayIndex["meshes"];
}
