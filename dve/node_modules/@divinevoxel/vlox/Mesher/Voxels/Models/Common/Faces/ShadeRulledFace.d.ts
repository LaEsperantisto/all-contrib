import { VoxelModelBuilder } from "../../VoxelModelBuilder";
import { Vec4Array } from "@amodx/math";
import { QuadVerticies } from "../../../../Geometry/Geometry.types";
export declare function ShadeRulledFace(builder: VoxelModelBuilder, trueFaceIndex: number, lightData: Record<QuadVerticies, number>, vertexWeights: Vec4Array[], vertexStride: number): void;
