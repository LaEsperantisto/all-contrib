import { Vec3Array, Vector3Like } from "@amodx/math";
export declare function CubeHashVec3Array(positionX: number, positionY: number, positionZ: number, xPower2: number, yPower2: number, zPower2: number, positionRef?: Vec3Array): Vec3Array;
export declare function CubeHashVec3(positionX: number, positionY: number, positionZ: number, xPower2: number, yPower2: number, zPower2: number, positionRef?: Vector3Like): Vector3Like;
export declare function GetYXZOrderArrayIndex(x: number, y: number, z: number, zPower: number, // log2(boundsZ)
xzPower: number): number;
export declare function GetYXZOrderArrayPositionVec3(index: number, zPower: number, xzPower: number, zMask: number, // boundsZ - 1
xMask: number, // boundsX - 1
positionRef?: Vector3Like): Vector3Like;
export declare function GetYXZOrderArrayPositionVec3Array(index: number, zPower: number, xzPower: number, zMask: number, // boundsZ - 1
xMask: number, // boundsX - 1
positionRef?: Vec3Array): Vec3Array;
