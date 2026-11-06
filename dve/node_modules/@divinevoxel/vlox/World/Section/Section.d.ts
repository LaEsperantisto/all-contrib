import { Sector } from "../Sector/Sector.js";
import { Vec2Array, Vec3Array } from "@amodx/math";
import { VoxelDataArrays } from "../../Voxels/index.js";
import { SectionStateDefaultFlags, SectionStateDefaultTicks } from "./SectionState.js";
export interface SectionData extends VoxelDataArrays {
    /**Array of bit ticks for the sector*/
    tickArray: Uint32Array;
    /**Array of bit flags for the sector*/
    flagArray: Uint8Array;
    /**Y slice of the section to tell if there is voxels or not. Used for height maps. */
    voxelMap: Uint8Array;
    /**Y slice of the section to tell if the slice is dirty and voxelMap needs to be re-checked. */
    dirtyMap: Uint8Array;
    /**A bit array used to cache if a voxel is exposed or not. */
    buried: Uint8Array;
}
export interface Section extends SectionData {
}
export declare class Section {
    static GetBufferSize(): number;
    static GetArrayStartIndex(index: number): number;
    position: Vec3Array;
    readonly _Flags: typeof SectionStateDefaultFlags;
    readonly _Ticks: typeof SectionStateDefaultTicks;
    index: number;
    sector: Sector;
    view: Uint8Array;
    updatePosition(): void;
    setBuffer(sector: Sector, buffer: ArrayBufferLike, index: number): void;
    clear(): void;
    getPosition(): Readonly<Vec3Array>;
    setBitFlag(index: number, value: boolean): void;
    getBitFlag(index: number): boolean;
    isInProgress(): boolean;
    setInProgress(inProgress: boolean): void;
    isLogicUpdateInProgress(): boolean;
    setLogicUpdateInProgress(inProgress: boolean): void;
    getBuried(index: number): boolean;
    setBuried(index: number, value: boolean): void;
    setHasVoxel(y: number, hasVoxel: boolean): void;
    getHasVoxel(y: number): boolean;
    setHasVoxelDirty(y: number, dirty: boolean): void;
    getHasVoxelDirty(y: number): boolean;
    getTick(tick: number): number;
    incrementTick(tick: number): void;
    canRender(): boolean;
    getMinMax(): Vec2Array;
    storeFlags(): Record<string, boolean>;
    loadFlags(flags: Record<string, boolean>): void;
}
