import { VoxelEffect } from "../../Voxels/Effects/VoxelEffect";
import { SectorMesh } from "./SectorMesh";
import { Vec3Array } from "@amodx/math";
export declare class SectionMesh {
    meshes: Map<string, any>;
    effects: Map<string, VoxelEffect>;
    sector: SectorMesh;
    index: number;
    getPosition(): Vec3Array;
    dispose(): void;
}
