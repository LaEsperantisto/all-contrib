import { ThreadManager } from "../Base/ThreadManager.js";
export declare class WorldThreadManager extends ThreadManager {
    meshers: import("@amodx/threads/").ThreadPool;
    generators: import("@amodx/threads/").ThreadPool;
    parent: import("@amodx/threads/").Thread;
    nexus: import("@amodx/threads/").Thread;
    constructor();
}
