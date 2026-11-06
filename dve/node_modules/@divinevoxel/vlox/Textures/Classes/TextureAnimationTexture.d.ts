import { CompiledTexture } from "./CompiledTexture";
export declare class TextureAnimationTexture {
    _texture: CompiledTexture;
    _buffer: Uint16Array;
    _size: number;
    shaderTexture: any;
    constructor(_texture: CompiledTexture);
    build(): Uint16Array<ArrayBufferLike>;
    tick(delta: number): boolean;
}
