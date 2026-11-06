import { Vec2Array } from "@amodx/math";
import { CompactedTextureData, TextureData } from "../Texture.types";
export declare function CreateCompactedTexture(type: string, baseURL: string, size: Vec2Array, textures: TextureData[]): Promise<{
    data: CompactedTextureData;
    image: HTMLImageElement;
}>;
