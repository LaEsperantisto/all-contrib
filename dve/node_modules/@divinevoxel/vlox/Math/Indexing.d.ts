import { Vec3Array, Vector3Like } from "@amodx/math";
export type IndexOrderingTypes = "XYZ" | "XZY" | "YXZ";
export declare function CubeHashVec3Array(positionX: number, positionY: number, positionZ: number, xPower2: number, yPower2: number, zPower2: number, positionRef?: Vec3Array): Vec3Array;
export declare function CubeHashVec3(positionX: number, positionY: number, positionZ: number, xPower2: number, yPower2: number, zPower2: number, positionRef?: Vector3Like): Vector3Like;
/**
 * YXZ order
 */
export declare function GetYXZOrderArrayPositionVec3Array(index: number, boundsX: number, boundsY: number, boundsZ: number, positionRef?: Vec3Array): Vec3Array;
export declare function GetYXZOrderArrayPositionVec3(index: number, boundsX: number, boundsY: number, boundsZ: number, positionRef?: Vector3Like): Vector3Like;
export declare function GetYXZOrderArrayIndex(positionX: number, positionY: number, positionZ: number, boundsX: number, boundsY: number, boundsZ: number): number;
/**
 * XYZ order
 */
export declare function GetXYZOrderArrayPositionVec3Array(index: number, boundsX: number, boundsY: number, boundsZ: number, positionRef?: Vec3Array): Vec3Array;
export declare function GetXYZOrderArrayPositionVec3(index: number, boundsX: number, boundsY: number, boundsZ: number, positionRef?: Vector3Like): Vector3Like;
export declare function GetXYZOrderArrayIndex(positionX: number, positionY: number, positionZ: number, boundsX: number, boundsY: number, boundsZ: number): number;
export declare function GetXZYOrderArrayPositionVec3Array(index: number, boundsX: number, boundsY: number, boundsZ: number, positionRef?: Vec3Array): Vec3Array;
/**
 * XZY order
 */
export declare function GetXZYOrderArrayPositionVec3(index: number, boundsX: number, boundsY: number, boundsZ: number, positionRef?: Vector3Like): Vector3Like;
export declare function GetXZYOrderArrayIndex(positionX: number, positionY: number, positionZ: number, boundsX: number, boundsY: number, boundsZ: number): number;
