import { TextureData } from "Textures/Texture.types";
import { CacheData, CachedDisplayIndex } from "./Cache.types";
export declare class CacheManager {
    static cacheStoreEnabled: boolean;
    static cacheLoadEnabled: boolean;
    static cachedData: CacheData | null;
    static cachedTextureData: TextureData[] | null;
    static cachedDisplayData: CachedDisplayIndex | null;
    static getCachedData(): CacheData;
}
