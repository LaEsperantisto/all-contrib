import { NumberPalette } from "../../../Util/NumberPalette";
import { Section } from "../../../World/Section";
import { ArchivedLightSegments } from "../Types/Archive.types";
import { VoxelArchivePalette } from "../../../Voxels/Archive/VoxelPaletteArechive";
declare class ProcessedData<Buffer = any> {
    buffer: Buffer;
    constructor(buffer: Buffer);
    allTheSame: boolean;
    isPaletted: boolean;
    remapped: boolean;
    value: number;
}
declare class SectionPalette {
    voxels: NumberPalette;
    level: NumberPalette;
    light: LightPalette;
    secondaryVoxels: NumberPalette;
}
export declare class ProcessedSection {
    original: Section;
    palettes: SectionPalette;
    light: Record<ArchivedLightSegments, ProcessedData<Uint8Array>>;
    level: ProcessedData<Uint8Array>;
    voxels: ProcessedData<Uint16Array>;
    secondaryVoxels: ProcessedData<Uint16Array>;
    constructor(original: Section);
}
declare class LightPalette {
    sun: NumberPalette;
    red: NumberPalette;
    green: NumberPalette;
    blue: NumberPalette;
}
export declare class VoxelStateObjectMap {
    palette: NumberPalette;
    states: any[];
}
export declare class SectorPalette {
    voxels: VoxelArchivePalette;
    level: NumberPalette;
    light: LightPalette;
}
export {};
