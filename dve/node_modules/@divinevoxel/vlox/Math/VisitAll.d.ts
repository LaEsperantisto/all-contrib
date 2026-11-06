import { Vector3Like } from "@amodx/math";
/** # Visit All
 * ---
 * Given a starting point and an end point it will visit all voxels that are between them.
 * @param startPoint
 * @param endPoint
 * @param visitor
 * @returns an array of numbers with a stride of 3 for positions
 */
export declare const VisitAll: (startPoint: Vector3Like, endPoint: Vector3Like, visitor?: (x: number, y: number, z: number) => boolean) => number[];
