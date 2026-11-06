import { NumberPalette } from "../../../Util/NumberPalette";
import { ArchivedLightSegments, ArchivedSectorData } from "../Types/index";
import { ImportedSection } from "./ImportedSection";
import { BinarySchema } from "../../../Voxels/State/Schema/BinarySchema";
import { VoxelPaletteArchiveReader } from "../../../Voxels/Archive/VoxelPaletteArchiveReader";
declare class ImportedSectorPalettes {
    voxelPalette: Uint16Array;
    stateSchemas: Map<number, BinarySchema>;
    modSchema: Map<number, BinarySchema>;
    level?: NumberPalette;
    light: Record<ArchivedLightSegments, NumberPalette | null>;
    constructor(sector: ArchivedSectorData);
}
export declare class ImportedSector {
    sector: ArchivedSectorData;
    sections: ImportedSection[];
    palettes: ImportedSectorPalettes;
    voxels: VoxelPaletteArchiveReader;
    constructor(sector: ArchivedSectorData);
}
export {};
