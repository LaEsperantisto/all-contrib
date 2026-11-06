import { BinarySchema } from "../State/Schema/BinarySchema";
import { ArchivedVoxelDataForPalette, VoxelArchivePaletteData } from "./VoxelArchive.types";
export declare class VoxelPaletteArchiveReader {
    temp: [id: string, state: number, mod: number];
    voxelPalette: Uint16Array;
    _voxels: ArchivedVoxelDataForPalette[];
    _voxelStateSchema: Map<string, BinarySchema>;
    _stateSchemas: Map<string, BinarySchema>;
    _modSchema: Map<string, BinarySchema>;
    constructor(palettes: VoxelArchivePaletteData);
    getVoxelData(id: number): [id: string, state: number, mod: number];
}
