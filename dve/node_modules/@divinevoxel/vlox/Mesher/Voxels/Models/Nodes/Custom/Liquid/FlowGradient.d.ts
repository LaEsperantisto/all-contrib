import type { VoxelModelBuilder } from "../../../VoxelModelBuilder";
import { QuadScalarVertexData } from "../../../../../Geometry/Primitives/QuadVertexData";
import { CompassAngles } from "@amodx/math";
export declare enum FlowVerticies {
    NorthEast = 0,
    NorthWest = 1,
    SouthWest = 2,
    SouthEsat = 3
}
export declare function getFlowAngle(vertexLevel: QuadScalarVertexData): [angle: CompassAngles, flow: number];
export declare function getFlowGradient(tool: VoxelModelBuilder, flowStates: QuadScalarVertexData): QuadScalarVertexData;
