import { VoxelFaceNames } from "../../../Math";
import { VoxelPlacingStrategyData } from "./VoxelPlacingStrategy.types";
import { VoxelPickResult } from "../VoxelPickResult";
export declare class VoxelModelPlacingStrategy {
    _faceMap: Map<VoxelFaceNames, VoxelPlacingStrategyData[]>;
    _defaultState: string;
    constructor(data: VoxelPlacingStrategyData[] | string);
    getState(picked: VoxelPickResult, alt?: number | null): string | null;
}
