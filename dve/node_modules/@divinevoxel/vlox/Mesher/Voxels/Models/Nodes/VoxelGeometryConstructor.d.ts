import { GeoemtryNode } from "./GeometryNode";
import { CullingProcedureData } from "../../../../Voxels/Geometry/VoxelGeometry.types";
export declare class VoxelGeometryConstructor {
    geometryPaletteId: number;
    nodes: GeoemtryNode<any, any>[];
    cullingProcedure: CullingProcedureData;
    constructor(geometryPaletteId: number);
}
