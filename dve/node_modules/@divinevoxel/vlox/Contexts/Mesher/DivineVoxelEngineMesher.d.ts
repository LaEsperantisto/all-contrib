import { Threads } from "@amodx/threads/";
import { MesherThreadsManager } from "./MesherTheads.js";
export declare class DivineVoxelEngineMesher {
    static environment: "node" | "browser";
    static instance: DivineVoxelEngineMesher;
    TC: typeof Threads;
    threads: MesherThreadsManager;
    constructor();
}
