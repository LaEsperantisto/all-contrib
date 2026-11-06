import { Vec3Array, Vector3Like } from "@amodx/math";
import { IndexOrderingTypes } from "../Math/Indexing.js";
export type WorldSpaceDataKey = {
    sector: {
        size: Vector3Like;
        sectionArrayOrder: IndexOrderingTypes;
    };
    section: {
        size: Vector3Like;
        arrayOrders: {
            id: IndexOrderingTypes;
            light: IndexOrderingTypes;
            level: IndexOrderingTypes;
            secondary: IndexOrderingTypes;
        };
    };
};
declare class WorldBounds {
    static bounds: {
        MinZ: number;
        MaxZ: number;
        MinX: number;
        MaxX: number;
        MinY: number;
        MaxY: number;
    };
    static setWorldBounds(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void;
    static inBounds(x: number, y: number, z: number): boolean;
    static getWorldWidth(): number;
    static getWorldDepth(): number;
    static getWorldHeightY(): number;
    static getWorldDimensions(): {
        width: number;
        depth: number;
        height: number;
    };
}
declare class SectorSpace {
    static power2Axes: Vector3Like;
    static bounds: Vector3Like;
    static volumne: number;
    static sectionBounds: Vector3Like;
    static sectionPower2Axes: Vector3Like;
    static sectionXZPower: number;
    static sectionZMask: number;
    static sectionXMask: number;
    static sectionVolumne: number;
    static getPosition(x: number, y: number, z: number, refPosition?: Vector3Like): Vector3Like;
    static transformPosition(position: Vector3Like): Vector3Like;
    static getPositionVec3Array(x: number, y: number, z: number, refPosition?: Vec3Array): Vec3Array;
}
declare class SectionSpace {
    static power2Axes: Vector3Like;
    static bounds: Vector3Like;
    static volumne: number;
    static xzPower: number;
    static zMask: number;
    static xMask: number;
    static getPosition(x: number, y: number, z: number, refPosition?: Vector3Like): Vector3Like;
    static transformPosition(position: Vector3Like): Vector3Like;
    static getPositionVec3Array(x: number, y: number, z: number, refPosition?: Vec3Array): Vec3Array;
    static getIndex(x: number, y: number, z: number): number;
    static getPositionFromIndex(index: number, refPosition?: Vector3Like): Vector3Like;
    static getPositionFromIndexVec3Array(index: number, refPosition?: Vec3Array): Vec3Array;
}
declare class VoxelSpace {
    static bounds: Vector3Like;
    static getPosition(x: number, y: number, z: number, refPosition?: Vector3Like): Vector3Like;
    static getPositionVec3Array(x: number, y: number, z: number, refPosition?: Vec3Array): Vec3Array;
    static transformPosition(position: Vector3Like): Vector3Like;
    static getPositionFromIndex(index: number, refPosition?: Vector3Like): Vector3Like;
    static getIndex(x: number, y: number, z: number): number;
    static getIndexFromPosition(x: number, y: number, z: number): number;
}
declare class Hash {
    static hashVec3(vector3: Vector3Like): string;
    static hashVec3Array(vector3: Vec3Array): string;
    static hashXYZ(x: number, y: number, z: number): string;
}
export declare class WorldSpaces {
    static hash: typeof Hash;
    static world: typeof WorldBounds;
    static sector: typeof SectorSpace;
    static section: typeof SectionSpace;
    static voxel: typeof VoxelSpace;
    static getDataKey(): WorldSpaceDataKey;
}
export {};
