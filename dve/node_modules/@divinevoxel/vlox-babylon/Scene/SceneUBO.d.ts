import { Scene } from "@babylonjs/core/scene";
import { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Observable } from "@babylonjs/core/Misc/observable";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
export declare class SceneUBO {
    buffer: UniformBuffer | null;
    static UniformBufferSuppourted: boolean;
    static get BaseDefine(): string;
    static get Define(): string;
    static DefaultUniforms: Map<string, number | Vector3 | Color3 | Vector4>;
    static Create(scene: Scene): UniformBuffer | null;
    observers: {
        beforeSync: Observable<unknown>;
    };
    uniforms: Map<string, number | Vector3 | Color3 | Vector4>;
    dirtyUniforms: Map<string, boolean>;
    fogColor: Color3;
    skyColor: Color3;
    /**
          x -> mode
              0 -> disabled
              1 -> exp.
              2 -> volumetric
              3 -> animated volumetric
          y -> density
          z -> height factor
        */
    fogOptions: Vector4;
    /**
          x -> shadeMode
              0 -> enabled
              1 -> disabled
          y -> fog start
          z -> fog end
        */
    fogShadeOptions: Vector4;
    /**
          x -> sky horizon
          y -> sky horizon start
          z -> sky horizon end
        */
    skyOptions: Vector4;
    /**
          x -> sky blend start
          y -> sky blend end
        */
    skyShadeOptions: Vector4;
    /**
          x -> doSun
          y -> doRGB
          z -> doAO
          w -> doColors
        */
    shadeOptions: Vector4;
    /**
          x -> enabled
        */
    effectOptions: Vector4;
    /**
          x -> baseLightLevel
          y -> sunLevel
        */
    levels: Vector4;
    _isDirty: boolean;
    get suppourtsUBO(): boolean;
    get allUniformsNames(): string[];
    constructor(buffer?: UniformBuffer | null);
    _clearDirtyUniforms(): void;
    setSkyColor(r: number, g: number, b: number): void;
    setSkyColor(color: Color3): void;
    setSkyOptions(x: number, y: number, z: number, w: number): void;
    setSkyOptions(options: Vector4): void;
    setSkyShadeOptions(x: number, y: number, z: number, w: number): void;
    setSkyShadeOptions(options: Vector4): void;
    setFogColor(r: number, g: number, b: number): void;
    setFogColor(color: Color3): void;
    setFogOptions(x: number, y: number, z: number, w: number): void;
    setFogOptions(options: Vector4): void;
    setFogShadeOptions(x: number, y: number, z: number, w: number): void;
    setFogShadeOptions(options: Vector4): void;
    setShadeOptions(x: number, y: number, z: number, w: number): void;
    setShadeOptions(options: Vector4): void;
    setEffectOptions(x: number, y: number, z: number, w: number): void;
    setEffectOptions(options: Vector4): void;
    setLevels(x: number, y: number, z: number, w: number): void;
    setLevels(levels: Vector4): void;
    updateTime(time: number): void;
    clone(scene: Scene): SceneUBO;
    syncToShaderMaterial(force: boolean | undefined, material: ShaderMaterial): void;
    update(): void;
}
