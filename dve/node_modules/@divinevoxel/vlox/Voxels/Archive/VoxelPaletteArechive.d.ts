import { StringPalette } from "../../Util/StringPalette";
import { VoxelBinaryStateSchemaNode } from "../State/State.types";
import { ArchivedVoxelDataForPalette, VoxelArchivePaletteData, ArchivedVoxelPaletteDataKey } from "./VoxelArchive.types";
export declare class VoxelArchivePalette {
    static GetVoxelPaletteDataKey(): ArchivedVoxelPaletteDataKey;
    get size(): number;
    _voxelsRegistered: Map<number, number>;
    _ids: StringPalette;
    _voxels: ArchivedVoxelDataForPalette[];
    _stateShemas: Record<string, VoxelBinaryStateSchemaNode[]>;
    _voxelPalette: number[];
    private _voxelCount;
    register(id: number): number;
    toJSON(): VoxelArchivePaletteData;
}
