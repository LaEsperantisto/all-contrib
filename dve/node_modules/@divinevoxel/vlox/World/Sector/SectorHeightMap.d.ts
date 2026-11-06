import { LocationData } from "../../Math";
export declare class SectorHeightMap {
    /**
     * Gets the relative height of the sector. Meaning will get the tallest sector in a square around it.
     */
    static getRelative(location: LocationData): number;
    /**
     * Gets the exact heigh of the single sector.
     */
    static getAbsolute(dimension: number, x: number, sy: number, z: number): number;
}
