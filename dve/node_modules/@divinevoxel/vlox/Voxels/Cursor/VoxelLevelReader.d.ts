/**# Voxel Reader
 * ---
 * Used to decode voxel state data.
 */
export declare class VoxelLevelReader {
    static getLevel(levelData: number): number;
    static setLevel(levelData: number, level: number): number;
    static getLevelState(levelData: number): number;
    static setLevelState(levelData: number, levelState: number): number;
}
