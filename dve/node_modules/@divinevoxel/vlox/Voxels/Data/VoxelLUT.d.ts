import { StringPalette } from "../../Util/StringPalette";
export type VoxelLUTExport = {
    material: string[];
    materialMap: number[];
    substance: string[];
    substanceMap: number[];
    voxelIds: string[];
    voxelNametoIdMap: [string, string][];
    voxelIdToNameMap: [string, string][];
    models: string[];
    modelsIndex: number[];
    totalStates: ArrayBufferLike;
    totalMods: ArrayBufferLike;
    totalReltionalStates: ArrayBufferLike;
    totalReltionalMods: ArrayBufferLike;
    totalVoxelIds: number;
    totalRelationalVoxelIds: number;
    totalCombinedIds: number;
    modelStateMaps: [number, number][][];
    modelRelationalStateMaps: [number, number][][];
    voxelModMaps: [number, number][][];
    voxelRelationalModMaps: [number, number][][];
    voxelIdToTrueId: ArrayBufferLike;
    voxelIdToState: ArrayBufferLike;
    voxelIdToMod: ArrayBufferLike;
    voxelRecordStartIndex: ArrayBufferLike;
    voxelRecord: ArrayBufferLike;
    relationalVoxelIdToTrueId: ArrayBufferLike;
    relationalVoxelIdToState: ArrayBufferLike;
    relationalVoxelIdToMod: ArrayBufferLike;
    relationalVoxelRecordStartIndex: ArrayBufferLike;
    relationalVoxelRecord: ArrayBufferLike;
    geometryIndex: ArrayBufferLike;
    geometryInputsIndex: ArrayBufferLike;
    conditionalGeometryIndex: [
        geometryId: number,
        modelState: number,
        modelReltionalState: boolean[]
    ][][];
    conditionalGeometryInputIndex: number[][][];
};
export declare class VoxelLUT {
    static material: StringPalette;
    static materialMap: number[];
    static substance: StringPalette;
    static substanceMap: number[];
    static voxelIds: StringPalette;
    static voxelNametoIdMap: Map<string, string>;
    static voxelIdToNameMap: Map<string, string>;
    static models: StringPalette;
    static modelsIndex: number[];
    static totalStates: Uint16Array;
    static totalMods: Uint16Array;
    static totalReltionalStates: Uint16Array;
    static totalReltionalMods: Uint16Array;
    static totalVoxelIds: number;
    static totalRelationalVoxelIds: number;
    /** totalVoxelIds * totalRelationalVoxelIds */
    static totalCombinedIds: number;
    /**Maps model ids to their state maps */
    static modelStateMaps: Map<number, number>[];
    /**Maps model ids to their relational state maps */
    static modelRelationalStateMaps: Map<number, number>[];
    /**Maps voxel true ids to their mod maps */
    static voxelModMaps: Map<number, number>[];
    /**Maps voxel true ids to their relational mod maps */
    static voxelRelationalModMaps: Map<number, number>[];
    /**Maps voxel id to its true voxel id */
    static voxelIdToTrueId: Uint16Array;
    /**Maps voxel id to its state */
    static voxelIdToState: Uint16Array;
    /**Maps voxel id to its mod */
    static voxelIdToMod: Uint16Array;
    /** Maps a voxels true id to where it starts in the voxel record.*/
    static voxelRecordStartIndex: Uint16Array;
    /** Maps a voxels true id to its state x mod to get the actual final voxel id*/
    static voxelRecord: Uint16Array;
    /**Maps voxel id to its true voxel id */
    static relationalVoxelIdToTrueId: Uint16Array;
    /**Maps voxel id to its state */
    static relationalVoxelIdToState: Uint16Array;
    /**Maps voxel id to its mod */
    static relationalVoxelIdToMod: Uint16Array;
    /** Maps a voxels true id to where it starts in the voxel record.*/
    static relationalVoxelRecordStartIndex: Uint16Array;
    /** Maps a voxels true id to its state x mod to get the actual final voxel id*/
    static relationalVoxelRecord: Uint16Array;
    static geometryIndex: Uint16Array;
    static geometryInputsIndex: Uint16Array;
    static conditionalGeometryIndex: [
        geometryId: number,
        modelState: number,
        modelReltionalState: boolean[]
    ][][];
    static conditionalGeometryInputIndex: number[][][];
    static getStateIndex(x: number, y: number, boundsX: number): number;
    static getVoxelId(trueId: number, state?: number, mod?: number): number;
    static getVoxelIdFromString(id: string, state?: number, mod?: number): number;
    static getReltionalVoxelId(trueId: number, relationalState?: number, relationalMod?: number): number;
    static getGeometryIndex(voxelId?: number, relationalId?: number): number;
    static getGeometryInputIndex(voxelId?: number, relationalId?: number): number;
    static getConditionalGeometryNodes(trueVoxelId: number): [
        geometryId: number,
        modelState: number,
        modelReltionalState: boolean[]
    ][];
    static getConditionalGeometryInputIndex(getIndex: number, voxelId?: number, relationalId?: number): number;
    static export(): VoxelLUTExport;
    static import(exported: VoxelLUTExport): void;
}
