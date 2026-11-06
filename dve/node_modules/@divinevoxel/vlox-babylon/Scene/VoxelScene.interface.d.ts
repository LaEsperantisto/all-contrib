import { Scene } from "@babylonjs/core/scene";
import { CompactedMeshData } from "@divinevoxel/vlox/Mesher/Voxels/Geometry/CompactedSectionVoxelMesh";
import { DVEBabylonRenderer } from "../Renderer/DVEBabylonRenderer";
import { SceneOptions } from "./SceneOptions";
export declare abstract class VoxelSceneInterface<MeshType extends any> {
    renderer: DVEBabylonRenderer;
    options: SceneOptions;
    constructor(renderer: DVEBabylonRenderer, options: SceneOptions);
    abstract init(scene: Scene): void;
    abstract removeMesh(mesh: MeshType): void;
    abstract updateMesh(subBufferMesh: MeshType, data: CompactedMeshData): void;
    abstract addMesh(data: CompactedMeshData, x: number, y: number, z: number): void;
    abstract beforRender(): void;
    abstract render(): void;
}
