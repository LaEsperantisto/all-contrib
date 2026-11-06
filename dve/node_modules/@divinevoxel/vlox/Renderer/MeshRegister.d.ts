import { type LocationData } from "../Math/index.js";
import { SectorMesh } from "./Classes/SectorMesh.js";
export type MeshRegisterDimensions = Map<number, Map<string, SectorMesh>>;
declare class Sectors {
    static add(dimensionId: number, x: number, y: number, z: number): SectorMesh;
    static addAt(location: LocationData): SectorMesh;
    static remove(dimensionId: number, x: number, y: number, z: number): false | SectorMesh;
    static removeAt(location: LocationData): false | SectorMesh;
    static get(dimensionId: number, x: number, y: number, z: number): false | SectorMesh | undefined;
    static getAt(location: LocationData): false | SectorMesh | undefined;
}
declare class Dimensions {
    static add(id: number): Map<any, any>;
    static get(id: number): Map<string, SectorMesh> | undefined;
    static remove(id: number): boolean;
}
export declare class MeshRegister {
    static _dimensions: MeshRegisterDimensions;
    static dimensions: typeof Dimensions;
    static sectors: typeof Sectors;
    static clearAll(): void;
}
export {};
