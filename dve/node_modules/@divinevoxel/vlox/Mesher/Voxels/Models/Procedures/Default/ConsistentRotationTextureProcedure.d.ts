import { Vec3Array, Vector4Like } from "@amodx/math";
import type { Quad } from "../../../../Geometry";
import { VoxelModelBuilder } from "../../../Models/VoxelModelBuilder";
import { TextureProcedure, BaseVoxelGeometryTextureProcedureData } from "../TextureProcedure";
import { TextureId } from "Textures";
import { VoxelFaces } from "Math";
/**
 * Extend your data type so we can add a seed if we want, and define
 * the rotations we can choose from.
 */
export interface ConsistentRotationTextureProcedureData extends BaseVoxelGeometryTextureProcedureData {
    type: "consistent-rotation";
    texture: TextureId | number;
    /**
     * You can allow (0 | 90 | 180 | 270), or remove 0 if you don’t want an unrotated option
     */
    rotations: (0 | 90 | 180 | 270)[];
    rotationBounds?: Vec3Array;
}
export declare class ConsistentRotationTextureProcedure extends TextureProcedure<ConsistentRotationTextureProcedureData> {
    getTexture(builder: VoxelModelBuilder, data: ConsistentRotationTextureProcedureData, closestFace: VoxelFaces, primitive: Quad): number;
    getOverlayTexture(builder: VoxelModelBuilder, data: ConsistentRotationTextureProcedureData, closestFace: VoxelFaces, primitive: Quad, ref: Vector4Like): Vector4Like;
    transformUVs(builder: VoxelModelBuilder, data: ConsistentRotationTextureProcedureData, closestFace: VoxelFaces, primitive: Quad): void;
}
