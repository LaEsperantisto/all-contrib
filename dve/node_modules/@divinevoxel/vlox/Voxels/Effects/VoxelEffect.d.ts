import { SectionMesh } from "../../Renderer/Classes/SectionMesh";
export interface VoxelEffectConstructor {
    id: string;
    new (mesh: SectionMesh): VoxelEffect;
}
export declare abstract class VoxelEffect {
    mesh: SectionMesh;
    constructor(mesh: SectionMesh);
    abstract init(): void;
    abstract setPoints(pointss: Float32Array): void;
    abstract dispose(): void;
}
