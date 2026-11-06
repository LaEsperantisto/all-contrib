import { Vec3Array } from "@amodx/math";
import { LocationData } from "../../../Math";
export declare class CompactedMeshData {
    material: number;
    materialId: string;
    minBounds: Vec3Array;
    maxBounds: Vec3Array;
    vertexCount: number;
    indexCount: number;
    vertexIndex: [start: number, length: number];
    indiceIndex: [start: number, length: number];
    verticies: Float32Array;
    indices: Uint32Array;
}
export declare class CompactedSectionVoxelMesh {
    static GetHeaderByteSize(totalMeshes?: number): number;
    static GetMeshHeaderByteSize(): number;
    data: DataView;
    setData(data: ArrayBuffer): void;
    setTotalMeshes(amount: number): void;
    getTotalMeshes(): number;
    setLocation(dimesion: number, x: number, y: number, z: number): void;
    getLocation(location?: LocationData): LocationData;
    setMeshData(index: number, mesh: CompactedMeshData): void;
    getMeshData(index: number, mesh: CompactedMeshData): CompactedMeshData;
}
