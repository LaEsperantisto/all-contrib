export type AOOcclusionFaceIndexData = {
    buffer: ArrayBufferLike;
    totalFaces: number;
};
export declare class AOOcclusionFaceIndex {
    view: Uint8Array;
    readonly totalFaces: number;
    constructor(data: AOOcclusionFaceIndexData);
    getValue(geometryId: number, directionIndex: number, faceIndex: number, vertexIndex: number): number;
    setValue(geometryId: number, directionIndex: number, faceIndex: number, vertexIndex: number, value?: number): void;
    toJSON(): AOOcclusionFaceIndexData;
}
