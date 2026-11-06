import { Vec3Array } from "@amodx/math";
import { Quad } from "../Primitives";
import { VoxelFaces } from "../../../Math";
type BoxPoints = [Vec3Array, Vec3Array];
export declare class Box {
    static Create(points?: BoxPoints): Box;
    quads: Record<VoxelFaces, Quad>;
    constructor(data: {
        points?: BoxPoints;
    });
    setPoints(points: BoxPoints): void;
}
export {};
