import { Vec3Array } from "@amodx/math";
export declare abstract class IOcclusionFace {
    points: Vec3Array[];
    normal: Vec3Array;
    offset: Vec3Array;
    abstract setOffset(x: number, y: number, z: number): void;
    abstract updatePoints(): void;
    abstract isPointInBounds(point: Vec3Array): boolean;
    abstract doesCoverFace(face: IOcclusionFace): boolean;
}
