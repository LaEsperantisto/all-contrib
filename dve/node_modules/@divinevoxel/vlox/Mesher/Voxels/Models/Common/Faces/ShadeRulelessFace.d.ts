import { QuadVerticies } from "../../../../Geometry/Geometry.types";
import { VoxelModelBuilder } from "../../../Models/VoxelModelBuilder";
import { Vec4Array } from "@amodx/math";
export declare function ShadeRulelessFace(builder: VoxelModelBuilder, lightData: Record<QuadVerticies, number>, vertexWeights: Vec4Array[], verticesStride: number): void;
