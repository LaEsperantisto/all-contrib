import { Vector4Like } from "@amodx/math";
declare enum WindAffectedAnimStates {
    Panel = 1,
    CrossPanel = 2,
    Box = 3
}
export declare class VoxelShaderData {
    static AnimationStates: {
        WindAffected: typeof WindAffectedAnimStates;
    };
    static v: number;
    static LightMask: number;
    static AOMask: number;
    static VertexMask: number;
    static AnimationMask: number;
    static TextureIndexMax: number;
    static createTextureIndex(index1: number, index2: number): number;
    static create(light1: number, light2: number, light3: number, light4: number, ao1: number, ao2: number, ao3: number, ao4: number, animation: number, vertexIndex: number, ref?: Vector4Like): Vector4Like;
}
export {};
