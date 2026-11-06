import { SectionSnapShot } from "./SectionSnapShot";
import { BoundingBox } from "@amodx/math/Geometry/Bounds/BoundingBox";
export declare class SnapShots {
    static _readyCache: SectionSnapShot[];
    static _pendingCache: SectionSnapShot[];
    private static bounds;
    static getSnapShotBounds(x: number, y: number, z: number): Readonly<BoundingBox>;
    static createSnapShot(dimension: number, x: number, y: number, z: number): SectionSnapShot;
    static transferSnapShot(snapShot: SectionSnapShot): void;
}
