import { PaintVoxelData } from "../Types/PaintVoxelData";
import { VoxelData, RawVoxelData, VoxelNamedStateData } from "../Types/Voxel.types";
export declare class VoxelNamedState {
    voxelId: string;
    data: VoxelNamedStateData;
    tags: Map<string, any>;
    compiled: {
        mod: number;
        modAny: boolean;
        state: number;
        stateAny: boolean;
    };
    constructor(voxelId: string, data: VoxelNamedStateData);
    getPaintData(): PaintVoxelData;
}
export declare class VoxelNamedStateContainer {
    voxelId: string;
    states: Map<string, VoxelNamedState>;
    stateArray: VoxelNamedState[];
    constructor(voxelId: string, data: VoxelNamedState[]);
}
declare class TagIndex {
    tagId: string;
    states: Map<string, VoxelNamedState>;
    valueMap: Map<string, any>;
    values: Set<any>;
    constructor(tagId: string);
}
export declare class VoxelIndex {
    static instance: VoxelIndex;
    dataMap: Map<string, VoxelData>;
    states: Map<string, VoxelNamedStateContainer>;
    stateArray: VoxelNamedStateContainer[];
    tagIndexes: Map<string, TagIndex>;
    constructor(data: VoxelData[]);
    private findState;
    getStateFromPaintData(data: PaintVoxelData): VoxelNamedState | false;
    getStateFromRawData(data: RawVoxelData): VoxelNamedState | false;
}
export {};
