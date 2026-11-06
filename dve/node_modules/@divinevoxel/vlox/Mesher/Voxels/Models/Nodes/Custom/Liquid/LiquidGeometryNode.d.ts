import { GeoemtryNode } from "../../GeometryNode";
import { VoxelCustomGeometryNode } from "../../../../../../Voxels/Geometry/VoxelGeometry.types";
import { VoxelFaces } from "../../../../../../Math";
import type { LiquidVoxelModelArgs } from "../../../../../../Voxels/Models/Defaults/LiquidVoxelModel";
export declare class LiquidGeometryNode extends GeoemtryNode<VoxelCustomGeometryNode, LiquidVoxelModelArgs> {
    init(): void;
    isExposed(face: VoxelFaces, voxelId: number): boolean;
    determineShading(face: VoxelFaces): void;
    add(args: LiquidVoxelModelArgs): boolean;
}
