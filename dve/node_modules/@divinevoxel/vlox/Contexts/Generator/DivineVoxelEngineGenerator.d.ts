import { Threads } from "@amodx/threads/";
import { GeneratorThreadsManager } from "./GeneratorThreads.js";
export declare class DivineVoxelEngineGenerator {
    static environment: "node" | "browser";
    static instance: DivineVoxelEngineGenerator;
    TC: typeof Threads;
    threads: GeneratorThreadsManager;
    constructor();
}
