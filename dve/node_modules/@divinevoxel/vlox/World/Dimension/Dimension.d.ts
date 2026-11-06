import { DimensionSyncData } from "../Types/WorldData.types";
import { Sector } from "../Sector";
export interface DimensionData {
    id: string;
    index: number;
    sectors: Map<string, Sector>;
}
export interface Dimension extends DimensionData {
}
export declare class Dimension {
    static CreateNew(index: number, id?: string): Dimension;
    constructor(data: DimensionData);
    set(sectorId: string, region: Sector): void;
    delete(sectorId: string): void;
    get(sectorId: string): Sector | undefined;
    getData(): DimensionSyncData;
}
