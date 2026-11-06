import { Thread, ThreadPool } from "@amodx/threads/";
import { PaintVoxelTemplateTask, PaintVoxelTask, EraseVoxelTask, EraseVoxelTemplateTask, PaintVoxelPathTask, EraseVoxelPathTask, EraseVoxelSelectionTask } from "../../Tasks/Tasks.types";
import { LocationData } from "../../Math";
import { SectionSnapShotTransferData } from "../../World/SnapShot/SectionSnapShot";
export type TaskRunModes = "async" | "sync";
interface ITask<Data> {
    run(data: Data, transfer: any[] | null, onDone?: (data: any) => void): void;
}
declare class TaskQueue<Data extends any = any, ReturnData extends any = void> {
    private _task;
    private _queue;
    constructor(_task: ITask<Data>);
    add(data: Data): void;
    clear(): void;
    run(): Promise<unknown>;
}
export declare class LocationTaskToolTask implements ITask<LocationData> {
    id: string;
    private _count;
    _threads: Thread[];
    constructor(id: string, threads: Thread | ThreadPool);
    run(location: LocationData, transfer?: any[] | null, onDone?: (data: any) => void, thread?: Thread): void;
    runAsync(location: LocationData): Promise<void>;
    createQueue(): TaskQueue<LocationData, void>;
}
export declare class TaskToolTask<Data extends any = any, ReturnData extends any = void> implements ITask<Data> {
    id: string;
    private _count;
    _threads: Thread[];
    constructor(id: string, threads: Thread | ThreadPool);
    run(data: Data, transfer?: any[] | null, onDone?: (returnData: ReturnData) => void | null): void;
    runAsync(data: Data, transfer?: any[] | null): Promise<ReturnData>;
    createQueue(): TaskQueue<Data, void>;
}
declare class VoxelTasks {
    tool: TaskTool;
    paint: TaskToolTask<PaintVoxelTask>;
    paintTemplate: TaskToolTask<PaintVoxelTemplateTask>;
    paintPath: TaskToolTask<PaintVoxelPathTask>;
    erase: TaskToolTask<EraseVoxelTask>;
    eraseTemplate: TaskToolTask<EraseVoxelTemplateTask>;
    eraseSelection: TaskToolTask<EraseVoxelSelectionTask>;
    erasePath: TaskToolTask<EraseVoxelPathTask>;
    constructor(tool: TaskTool);
}
declare class BuildTask {
    tool: TaskTool;
    sectionSnapShot: TaskToolTask<SectionSnapShotTransferData>;
    section: LocationTaskToolTask;
    sector: LocationTaskToolTask;
    constructor(tool: TaskTool);
}
declare class SimulationTasks {
    tool: TaskTool;
    logic: LocationTaskToolTask;
    propagation: LocationTaskToolTask;
    constructor(tool: TaskTool);
}
declare class GenerationTasks {
    tool: TaskTool;
    propagation: LocationTaskToolTask;
    generate: LocationTaskToolTask;
    decorate: LocationTaskToolTask;
    worldSun: LocationTaskToolTask;
    constructor(tool: TaskTool);
}
export declare class TaskTool {
    meshers: Thread | ThreadPool;
    generators: Thread | ThreadPool;
    voxel: VoxelTasks;
    build: BuildTask;
    generation: GenerationTasks;
    simulation: SimulationTasks;
    constructor(meshers: Thread | ThreadPool, generators: Thread | ThreadPool);
    getMesher(): Thread;
    getGenerator(): Thread;
}
export {};
