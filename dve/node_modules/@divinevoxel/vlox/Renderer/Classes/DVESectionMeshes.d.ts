import { SectionMesh } from "./SectionMesh";
import { CompactedSectionVoxelMesh } from "../../Mesher/Voxels/Geometry/CompactedSectionVoxelMesh";
export declare abstract class DVESectionMeshes {
    abstract updateVertexData(section: SectionMesh, data: CompactedSectionVoxelMesh): SectionMesh;
    abstract returnMesh(mesh: any): void;
}
