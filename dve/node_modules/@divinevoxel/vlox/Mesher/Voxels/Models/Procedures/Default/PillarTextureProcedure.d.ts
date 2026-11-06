import { Vector4Like } from "@amodx/math";
import type { Quad } from "../../../../Geometry";
import { VoxelModelBuilder } from "../../../Models/VoxelModelBuilder";
import { TextureProcedure, BaseVoxelGeometryTextureProcedureData } from "../TextureProcedure";
import { TextureId } from "../../../../../Textures";
import { VoxelFaces } from "../../../../../Math";
/**
 * Extend your data type so we can add a seed if we want, and define
 * the rotations we can choose from.
 */
export interface PillarTextureProcedureData extends BaseVoxelGeometryTextureProcedureData {
    type: "pillar";
    texture: TextureId | number;
    textureRecrod: {
        sideConnectedTex: TextureId | number;
        sideDisconnectedTex: TextureId | number;
        sideUpTex: TextureId | number;
        sideDownTex: TextureId | number;
        upTex: TextureId | number;
        downTex: TextureId | number;
    };
    direction: "up-down" | "north-south" | "east-west";
}
export declare class PillarTextureProcedure extends TextureProcedure<PillarTextureProcedureData> {
    getTexture(builder: VoxelModelBuilder, data: PillarTextureProcedureData, closestFace: VoxelFaces, primitive: Quad): number;
    getOverlayTexture(builder: VoxelModelBuilder, data: PillarTextureProcedureData, closestFace: VoxelFaces, primitive: Quad, ref: Vector4Like): Vector4Like;
    transformUVs(builder: VoxelModelBuilder, data: PillarTextureProcedureData, closestFace: VoxelFaces, primitive: Quad): void;
}
