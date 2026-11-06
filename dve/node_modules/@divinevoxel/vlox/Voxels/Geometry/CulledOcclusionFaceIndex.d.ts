export type CulledOcclusionFaceIndexData = {
    buffer: ArrayBufferLike;
    totalFaces: number;
};
export declare class CulledOcclusionFaceIndex {
    view: Uint8Array;
    readonly totalFaces: number;
    constructor(data: CulledOcclusionFaceIndexData);
    getValue(geometryId: number, directionIndex: number, faceIndex: number): number;
    setValue(geometryId: number, directionIndex: number, faceIndex: number, value?: number): void;
    toJSON(): CulledOcclusionFaceIndexData;
}
