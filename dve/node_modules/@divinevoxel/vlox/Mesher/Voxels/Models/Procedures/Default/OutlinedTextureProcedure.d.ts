import { Vector4Like } from "@amodx/math";
import type { Quad } from "../../../../Geometry";
import { VoxelModelBuilder } from "../../../Models/VoxelModelBuilder";
import { TextureProcedure, BaseVoxelGeometryTextureProcedureData } from "../TextureProcedure";
import { TextureId } from "Textures";
import { VoxelFaces } from "../../../../../Math/index.js";
export interface OutlinedTextureProcedureData extends BaseVoxelGeometryTextureProcedureData {
    type: "outlined";
    texture: TextureId | number;
    textureRecrod: {
        top: TextureId | number;
        "corner-top-right": TextureId | number;
        "corner-top-left": TextureId | number;
        "corner-top-left-top-right": TextureId | number;
        bottom: TextureId | number;
        "corner-bottom-right": TextureId | number;
        "corner-bottom-left": TextureId | number;
        "corner-bottom-left-bottom-right": TextureId | number;
        right: TextureId | number;
        left: TextureId | number;
    };
}
export declare class OutlinedTextureProcedure extends TextureProcedure<OutlinedTextureProcedureData> {
    getTexture(builder: VoxelModelBuilder, data: OutlinedTextureProcedureData, closestFace: VoxelFaces, primitive: Quad): number;
    getOverlayTexture(builder: VoxelModelBuilder, data: OutlinedTextureProcedureData, closestFace: VoxelFaces, primitive: Quad, ref: Vector4Like): Vector4Like;
    transformUVs(builder: VoxelModelBuilder, data: OutlinedTextureProcedureData, closestFace: VoxelFaces, primitive: Quad): void;
}
