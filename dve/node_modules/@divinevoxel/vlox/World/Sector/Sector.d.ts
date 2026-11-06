import { Section, SectionData } from "../Section/Section.js";
import { Vec2Array, Vec3Array } from "@amodx/math";
import { SectorStateDefaultBitFlags } from "./SectorState.js";
export interface SectorData {
    buffer: ArrayBufferLike;
    /**Array of timestamps for the sector */
    timeStampArray: Uint32Array;
    /**Array of bit flags for the sector*/
    flagArray: Uint8Array;
    sections: SectionData[];
}
export interface Sector extends SectorData {
}
export declare class Sector {
    static FlagIds: typeof SectorStateDefaultBitFlags;
    static TimeStampIds: typeof import("./SectorState.js").SectorStateDefaultTimeStamps;
    static GetHeaderSize(): number;
    static GetBufferSize(): number;
    static CreateNewBuffer(): ArrayBuffer | SharedArrayBuffer;
    sections: Section[];
    bufferView: Uint8Array;
    position: Vec3Array;
    private _released;
    setReleased(released: boolean): void;
    isReleased(): boolean;
    private _checkedOut;
    /**Set if the sector is checked out into another thread.  */
    setCheckedOut(checkedOut: boolean): void;
    /**Will return true if the sector is checked out into another thread. */
    isCheckedOut(): boolean;
    /**Returns a promise that will resolve when the sector is no longer checked out. */
    waitTillCheckedIn(): true | Promise<boolean>;
    private _locked;
    /**Set if the secotr is locked and can't be checked out.*/
    setLocked(locked: boolean): void;
    /**Will return true if the sector is locked out and can't be checked out. */
    isLocked(): boolean;
    setBuffer(buffer: ArrayBufferLike): void;
    clear(): void;
    updateSectionDirectly(index: number, view: Uint8Array): void;
    getSection(x: number, y: number, z: number): Section;
    setBitFlag(index: number, value: boolean): void;
    getBitFlag(index: number): boolean;
    isDisplayDirty(): boolean;
    setDisplayDirty(stored: boolean): void;
    isLogicDirty(): boolean;
    setLogicDirty(stored: boolean): void;
    setStored(stored: boolean): void;
    isStored(): boolean;
    setTimeStamp(index: number, value: number): void;
    getTimeStamp(index: number): number;
    getRenerableSections(): Generator<Section>;
    storeFlags(): Record<string, boolean>;
    loadFlags(flags: Record<string, boolean>): void;
    storeTimestamps(): Record<string, number>;
    loadTimestamps(stored: Record<string, number>): void;
    getMinMax(): Vec2Array;
}
