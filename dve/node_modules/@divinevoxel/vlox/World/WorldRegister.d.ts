import { Dimension } from "./Dimension/Dimension";
import { Sector, SectorData } from "./Sector/Sector.js";
import type { LocationData } from "../Math/index.js";
import { DimensionSyncData } from "./Types/WorldData.types.js";
import { Section } from "./Section/Section.js";
declare class WorldDataHooks {
    static dimension: {
        onNew: (dimension: DimensionSyncData) => void;
        onRemove: (location: LocationData) => void;
    };
    static sectors: {
        onNew: (location: LocationData, sector: SectorData) => void;
        onRemove: (location: LocationData, sector: SectorData) => void;
    };
}
declare class WorldRegisterDimensions {
    static _dimensionMap: Map<string, number>;
    static add(index: number, id?: string): Dimension;
    static get(index: number): Dimension | undefined;
}
declare class WorldRegisterPools {
    static _sectorBuffers: ArrayBufferLike[];
    static _sectors: Sector[];
    static _sections: Section[];
    static _sectorBufferEnabled: boolean;
    static getSector(): ArrayBufferLike;
    static returnSector(sector: Sector): void;
}
declare class WorldRegisterSectors {
    static setSecotrBufferPool(enabled: boolean): void;
    static add(dimensionId: number, x: number, y: number, z: number, sector: ArrayBufferLike): Sector;
    static addAt(location: LocationData, sector: ArrayBufferLike): Sector;
    static new(dimensionId: number, x: number, y: number, z: number): boolean;
    static newAt(location: LocationData): boolean;
    static get(dimensionId: number, x: number, y: number, z: number): null | Sector;
    static getAt(location: LocationData): Sector | null;
    static remove(dimensionId: number, x: number, y: number, z: number): ArrayBuffer | null;
    static removeAt(location: LocationData): ArrayBuffer | null;
}
export declare class WorldRegister {
    static proxy: boolean;
    static _pools: typeof WorldRegisterPools;
    static _dimensions: Map<number, Dimension>;
    static _hooks: typeof WorldDataHooks;
    static dimensions: typeof WorldRegisterDimensions;
    static sectors: typeof WorldRegisterSectors;
    static clearAll(): void;
}
export {};
