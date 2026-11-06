import { Vec2Array } from "@amodx/math";
import { TextureAtlasIndex } from "./TextureAtlasIndex";
import { CompactedTextureNodeBaseData } from "Textures/Texture.types";
export declare class CompactedTextureReader {
    canvas: HTMLCanvasElement;
    context: CanvasRenderingContext2D;
    atlasCanvas: HTMLCanvasElement;
    atlasContext: CanvasRenderingContext2D;
    textureCanvas: HTMLCanvasElement;
    textureContext: CanvasRenderingContext2D;
    index: TextureAtlasIndex;
    atlasIndex: TextureAtlasIndex;
    size: Vec2Array;
    textureSize: Vec2Array;
    constructor();
    setSize(size: Vec2Array, textureSize: Vec2Array): void;
    loadImage(path: string): Promise<boolean>;
    getFinalImage(): HTMLImageElement;
    writeImage(index: number, image: HTMLImageElement): void;
    readImage(data: CompactedTextureNodeBaseData): Promise<HTMLImageElement>;
    readImageAtIndex(index: number): Promise<HTMLImageElement>;
}
