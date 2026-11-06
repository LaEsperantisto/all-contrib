import { BaseVoxelGeometryTextureProcedureData } from "../Procedures/TextureProcedure";
import { VoxelModelBuilder } from "../VoxelModelBuilder";
import { Quad } from "../../../Geometry";
import { VoxelFaces } from "../../../../Math";
import { Triangle } from "../../../Geometry";
export declare function GetTexture(builder: VoxelModelBuilder, data: number | BaseVoxelGeometryTextureProcedureData, closestFace: VoxelFaces, primitive: Quad | Triangle): void;
