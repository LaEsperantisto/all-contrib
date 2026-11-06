export declare class CompiledTextureAnimation {
    textureIndex: number;
    _frames: number[];
    _times: number[];
    _currentTime: number;
    _frameIndex: number;
    _current: number;
    _animatedTextureIndex: number;
    constructor(textureIndex: number);
    tick(delta: number): boolean | undefined;
    getIndex(): number;
}
