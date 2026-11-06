import { AOOcclusionFaceIndex, AOOcclusionFaceIndexData } from "../Geometry/AOOcclusionFaceIndex";
import { CompiledGeometryNodes } from "../../Mesher/Voxels/Models/Nodes/Types/GeometryNode.types";
import { CulledOcclusionFaceIndex, CulledOcclusionFaceIndexData } from "../Geometry/CulledOcclusionFaceIndex";
import { CullingProcedureData } from "../Geometry/VoxelGeometry.types";
export type GeometryLUTExport = {
    geometryIndex: number[][];
    geometryInputsIndex: number[][];
    geometryInputs: any[][];
    compiledGeometry: CompiledGeometryNodes[][];
    rulelessIndex: boolean[];
    geometryCullingProceduresIndex: number[];
    geometryCullingProcedures: CullingProcedureData[];
    faceCullIndex: CulledOcclusionFaceIndexData;
    aoIndex: AOOcclusionFaceIndexData;
    faceCullMap: number[][];
    aoVertexHitMap: number[][][];
};
export declare class GeometryLUT {
    static geometryIndex: number[][];
    static geometryInputsIndex: number[][];
    static geometryInputs: any[][];
    static compiledGeometry: CompiledGeometryNodes[][];
    static rulelessIndex: boolean[];
    static geometryCullingProceduresIndex: number[];
    static geometryCullingProcedures: CullingProcedureData[];
    static faceCullIndex: CulledOcclusionFaceIndex;
    static aoIndex: AOOcclusionFaceIndex;
    static faceCullMap: number[][];
    static aoVertexHitMap: number[][][];
    static export(): GeometryLUTExport;
    static import(exported: GeometryLUTExport): void;
}
