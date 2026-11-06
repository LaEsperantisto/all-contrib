import { Vec2Array } from "@amodx/math";
import { WorkItemProgress } from "../Util/WorkItemProgress.js";
import { CompiledTexture } from "./Classes/CompiledTexture.js";
import { BuildTextureDataProps } from "./Functions/BuildTextureData.js";
import type { CompactedTextureData, TextureData } from "./Texture.types";
export declare class TextureManager {
    static _textureTypes: Map<string, TextureData[]>;
    static _compiledTextures: Map<string, CompiledTexture>;
    static addTextureType(typeId: string): TextureData[];
    static registerTexture(textureData: TextureData[]): void;
    static getTexture(id: string): CompiledTexture;
    static compiledTextures(props?: Omit<BuildTextureDataProps, "textures" | "type">, progress?: WorkItemProgress): Promise<void>;
    static createCompactedTextures(baseURL: string, textureSize: Vec2Array): Promise<{
        data: CompactedTextureData;
        image: HTMLImageElement;
    }[]>;
    static readCompactedTexture(data: CompactedTextureData, path: string): Promise<void>;
}
