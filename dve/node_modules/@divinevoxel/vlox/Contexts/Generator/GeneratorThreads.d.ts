import { ThreadManager } from "../Base/ThreadManager";
export declare class GeneratorThreadsManager extends ThreadManager {
    static instnace: GeneratorThreadsManager;
    parent: import("@amodx/threads/").Thread;
    world: import("@amodx/threads/").Thread;
    constructor();
}
