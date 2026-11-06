import { TypedEventTarget } from "../../Util/TypedEventTarget";
import { PaintVoxelData } from "../../Voxels/Types/PaintVoxelData";
import type { VoxelPathData, VoxelPathSegmentData } from "./VoxelPath.types";
import type { Vec3Array } from "@amodx/math";
export interface VoxelPathSegmentsEvents {
    updated: {};
}
export declare class VoxelPathSegment extends TypedEventTarget<VoxelPathSegmentsEvents> implements VoxelPathSegmentData {
    path: VoxelPath;
    index: number;
    static CreateNew(data: Partial<VoxelPathSegmentData>): VoxelPathSegmentData;
    start: Vec3Array;
    end: Vec3Array;
    voxel: PaintVoxelData;
    transient: boolean;
    constructor(path: VoxelPath, index: number, data: VoxelPathSegmentData);
    setPoints([sx, sy, sz]: Vec3Array, [ex, ey, ez]: Vec3Array): void;
    getPoint(point: 0 | 1): Vec3Array;
    setPoint(point: 0 | 1, vec: Vec3Array): void;
    toJSON(): VoxelPathSegmentData;
}
export interface VoxelPathEvents {
    segmentAdded: VoxelPathSegment;
    segmentRemoved: VoxelPathSegment;
}
export declare class VoxelPath extends TypedEventTarget<VoxelPathEvents> {
    data: VoxelPathData;
    static CreateNew(data: Partial<VoxelPathData>): VoxelPathData;
    segments: VoxelPathSegment[];
    constructor(data: VoxelPathData);
    get totalSegments(): number;
    lastSegment(): VoxelPathSegment | null;
    firstSegment(): VoxelPathSegment | null;
    addSegment(data: VoxelPathSegmentData): boolean;
    removeSegment(segment: VoxelPathSegment): boolean;
    removePoint(segmentIndex: number, pointIndex: 0 | 1): false | undefined;
    toJSON(): VoxelPathData;
}
