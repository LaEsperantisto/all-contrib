import { Vec2Array } from "@amodx/math";
export declare class TextureAtlasIndex {
    bounds: Vec2Array;
    setBounds(bounds: Vec2Array): void;
    getIndex(x: number, y: number): number;
    getPosition(index: number, position?: Vec2Array): Vec2Array;
}
