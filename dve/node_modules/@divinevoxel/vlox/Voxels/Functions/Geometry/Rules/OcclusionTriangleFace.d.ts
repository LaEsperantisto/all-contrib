import { Vec3Array } from "@amodx/math";
import { IOcclusionFace } from "./OcclusionFace";
export declare class OcclusionTriangleFace extends IOcclusionFace {
    normals: Vec3Array[];
    points: [Vec3Array, Vec3Array, Vec3Array];
    private _points;
    setPoints(points: [Vec3Array, Vec3Array, Vec3Array]): void;
    setOffset(x: number, y: number, z: number): void;
    updatePoints(): void;
    private isPointInTriangle;
    isPointInBounds(point: Vec3Array): boolean;
    isPointOnFace(x: number, y: number, z: number): boolean;
    doesCoverFace(face: IOcclusionFace): boolean;
}
