import { Vec4Array } from "@amodx/math";
import { VoxelFaces } from "../../../../../Math";
import { GeoemtryNode } from "../GeometryNode";
import { CompiledTriangleVoxelGeometryNode, TriangleVoxelGometryArgs } from "../Types/TriangleVoxelGometryNodeTypes";
import { Triangle } from "../../../../Geometry/Primitives/Triangle";
export declare class TriangleVoxelGeometryNode extends GeoemtryNode<CompiledTriangleVoxelGeometryNode, TriangleVoxelGometryArgs> {
    triangle: Triangle;
    vertexWeights: Vec4Array[];
    closestFace: VoxelFaces;
    trueFaceIndex?: number;
    init(): void;
    add(args: TriangleVoxelGometryArgs): boolean;
}
