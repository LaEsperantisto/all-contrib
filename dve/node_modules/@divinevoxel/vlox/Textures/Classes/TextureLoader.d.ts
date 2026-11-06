import { Vec2Array } from "@amodx/math";
import { TextureData } from "../Texture.types";
import { TextureAtlasIndex } from "./TextureAtlasIndex";
export declare class TextureLoader {
    baseURL: string;
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    atlasCanvas: HTMLCanvasElement;
    atlasContext: CanvasRenderingContext2D;
    size: Vec2Array;
    atlasIndex: TextureAtlasIndex;
    constructor();
    setSize(size: Vec2Array): void;
    getImageBase64(url: string): Promise<string>;
    loadImage(src: string): Promise<HTMLImageElement>;
    sliceImageIntoTiles(src: string, tilesX: number, tilesY: number): Promise<HTMLImageElement[]>;
    getImagePath(data: TextureData, parentId?: string | null): string;
    getTextureId(data: TextureData, parentId?: string | null): string;
    loadImageForShader(imgSrcData: string | HTMLImageElement): Promise<HTMLImageElement>;
}
