import type { LocationData } from "../../Math";
import { RawVoxelData } from "../../Voxels/Types/Voxel.types";
import { Thread } from "@amodx/threads";
export declare class WorldGenRegister {
    static _worldThread: Thread;
    static MAX_ATTEMPTS: number;
    static _requests: Map<string, {
        attempts: number;
        dimension: number;
        sections: Map<string, [x: number, y: number, z: number]>;
        voxels: [x: number, y: number, z: number, data: RawVoxelData][];
    }>;
    static registerRequest(location: Readonly<LocationData>): string;
    static addToRequest(registerId: string, location: LocationData, rawData: RawVoxelData): false | undefined;
    static attemptRequestFullFill(registerId: string): boolean;
}
