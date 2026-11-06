import { ThreadManager } from "../Base/ThreadManager";
export declare class MesherThreadsManager extends ThreadManager {
    static instnace: MesherThreadsManager;
    parent: import("@amodx/threads/").Thread;
    world: import("@amodx/threads/").Thread;
    constructor();
}
