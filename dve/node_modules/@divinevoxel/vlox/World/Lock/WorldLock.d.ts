import type { WorldLockTasks } from "../../Tasks/Tasks.types";
import { WorldStorageInterface } from "../Types/WorldStorage.interface";
export declare class WorldLock {
    static locks: Map<string, WorldLockTasks>;
    static _loadMap: Map<string, boolean>;
    static worldStorage: WorldStorageInterface | null;
    static addLock(taskData: WorldLockTasks): Promise<unknown>;
    static removeLock(data: WorldLockTasks): void;
    static isLocked(sdim: number, x: number, y: number, z: number): boolean;
}
