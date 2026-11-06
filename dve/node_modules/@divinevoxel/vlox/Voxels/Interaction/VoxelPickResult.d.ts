import { Vector3Like } from "@amodx/math";
import { VoxelFaces } from "../../Math";
import { RawVoxelData } from "../../Voxels/Types/Voxel.types";
import { VoxelCursor } from "../../Voxels/Cursor/VoxelCursor";
export interface VoxelPickResultData {
    /**The origin of the ray */
    rayOrigin: Vector3Like;
    /**The direction of the ray */
    rayDirection: Vector3Like;
    /**The length of the ray */
    rayLength: number;
    /**The space position of the voxel */
    position: Vector3Like;
    /**The normal of the unit voxel that was hit */
    normal: Vector3Like;
    /**The distance from the ray start to the intersection point */
    distance: number;
    /**Position + the unit  normal */
    normalPosition: Vector3Like;
    /**The voxel data */
    voxelData: RawVoxelData;
    /**Closest unit normal of the ray direction */
    unitRayDirection: Vector3Like;
    /**Closest voxel face of the ray direction */
    unitRayVoxelFace: VoxelFaces;
    /**Closest unit normal of the picked normal */
    unitNormal: Vector3Like;
    /**Closest voxel face of the picked normal */
    unitNormalFace: VoxelFaces;
    delta: number;
}
export declare class VoxelPickResult implements VoxelPickResultData {
    rayOrigin: Vector3Like;
    rayDirection: Vector3Like;
    rayLength: number;
    voxelData: RawVoxelData;
    position: Vector3Like;
    normal: Vector3Like;
    distance: number;
    normalPosition: Vector3Like;
    unitRayDirection: Vector3Like;
    unitRayVoxelFace: VoxelFaces;
    unitNormal: Vector3Like;
    unitNormalFace: VoxelFaces;
    delta: number;
    voxel: VoxelCursor;
    static FromJSON(data: VoxelPickResultData): VoxelPickResult;
    constructor(rayOrigin: Vector3Like, rayDirection: Vector3Like, rayLength: number, voxelData: RawVoxelData, position: Vector3Like, normal: Vector3Like, distance: number, normalPosition: Vector3Like, unitRayDirection: Vector3Like, unitRayVoxelFace: VoxelFaces, unitNormal: Vector3Like, unitNormalFace: VoxelFaces, delta: number);
    clone(): VoxelPickResult;
    toJSON(): VoxelPickResultData;
}
