import { RawVoxelData } from "./Voxel.types";
export declare class PaintVoxelData {
    id: string;
    name: string;
    state: number;
    stateString: string;
    mod: number;
    modString: string;
    level: number;
    levelState: number;
    secondaryVoxelId: string;
    secondaryName: string;
    secondaryMod: number;
    secondaryModString: string;
    secondaryState: number;
    secondaryStateString: string;
    static Create(data?: Partial<PaintVoxelData>): PaintVoxelData;
    /**Transforms numeric voxel data into a PaintVoxelData object */
    static FromRaw(data: RawVoxelData, paintData?: PaintVoxelData): PaintVoxelData;
    /**Transforms the voxel data into numeric voxel data */
    static ToRaw(data: Partial<PaintVoxelData>, light?: number): RawVoxelData;
    /**Restores the data to the default state of being dve_air */
    static Clear(data: PaintVoxelData): PaintVoxelData;
    /**Clears the target data and then copies properties from source to target. */
    static Set(target: PaintVoxelData, source: Partial<PaintVoxelData>): PaintVoxelData;
    /**Takes PaintVoxelData and convert mod and state strings to numbers and then */
    static Populate(data: Partial<PaintVoxelData>): Partial<PaintVoxelData>;
    private constructor();
}
