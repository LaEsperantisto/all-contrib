import { ThreadManager } from "../Base/ThreadManager";
export declare class DVERenderThreads extends ThreadManager {
    nexus: import("@amodx/threads").Thread;
    meshers: import("@amodx/threads").ThreadPool;
    generators: import("@amodx/threads").ThreadPool;
    parent: import("@amodx/threads").Thread;
    world: import("@amodx/threads").Thread;
    constructor();
}
