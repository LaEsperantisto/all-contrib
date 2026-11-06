declare class GeometryStats {
    /**The total geometry faces */
    faces: number;
}
declare class PaletteStats {
    /**The final voxel palette id size. */
    paletteSize: number;
    /**The final reltional voxel palette id size. */
    reltionalPaletteSize: number;
}
/**
 * Stores data from the results of the engine building data and other things.
 */
export declare class EngineStats {
    /** Stats to do with the vlox model system. */
    static geometry: GeometryStats;
    /** Stats to do with the vloxel palette system. */
    static palette: PaletteStats;
    static log(): string;
}
export {};
