import { CachedDisplayIndex } from "../../Cache/Cache.types";
export declare class VoxelTextureIndex {
    static voxelImages: Map<string, Map<string, HTMLImageElement>>;
    static registerImage(voxelId: string, namedStateId: string, source: string): void;
    static getImage(voxelId: string, namedStateId: string): false | HTMLImageElement;
    static loadData(data: CachedDisplayIndex["textures"]): void;
    static cacheData(): CachedDisplayIndex["textures"];
}
