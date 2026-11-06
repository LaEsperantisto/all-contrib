import { CompassDirections, Vec3Array } from "@amodx/math";
export type VoxelFaceNames = "up" | "down" | "north" | "south" | "east" | "west";
export declare const VoxelFaceNameArray: VoxelFaceNames[];
export declare const VoxelFaceNameOppoisteRecord: Record<VoxelFaceNames, VoxelFaceNames>;
export declare const VoxelFaceNameDirectionsRecord: Record<VoxelFaceNames, Vec3Array>;
export declare const enum VoxelFaces {
    Up = 0,
    Down = 1,
    North = 2,
    South = 3,
    East = 4,
    West = 5
}
export declare const VoxelFacesArray: readonly VoxelFaces[];
export declare const VoxelFaceDirections: Readonly<Vec3Array[]>;
export declare const VoxelFaceOpositeDirectionMap: Record<VoxelFaces, VoxelFaces>;
export declare const VoxelFaceCompassDirectionMap: Record<VoxelFaces, CompassDirections>;
export declare const CompassDirectionVoxelFaceMap: Record<CompassDirections, VoxelFaces>;
export declare const VoxelFaceNameRecord: Record<VoxelFaceNames, VoxelFaces>;
export declare const VoxelFaceNameMap: Record<VoxelFaces, VoxelFaceNames>;
