import { Vector3Like } from "@amodx/math";
import { TaskTool } from "../../Tools/Tasks/TasksTool";
import { TaskSegment } from "../Tasks/TaskSegment";
import { Generator } from "./Generator";
import { SimulationSector } from "./SimulationSector";
import { DimensionSimulation } from "./DimensionSimulation";
import { SimulationBrush } from "../Tools/SimulationBrush";
declare class ActiveSectors {
    dimension: DimensionSegment;
    _sectors: SimulationSector[];
    _map: Map<string, SimulationSector>;
    constructor(dimension: DimensionSegment);
    add(x: number, y: number, z: number): false | undefined;
    clearAll(): void;
    get(x: number, y: number, z: number): SimulationSector | null | undefined;
    remove(x: number, y: number, z: number): false | undefined;
}
export declare class DimensionSegment {
    id: number;
    taskTool: TaskTool;
    private tick;
    tasks: Map<string, TaskSegment>;
    activeSectors: ActiveSectors;
    generators: Generator[];
    simulation: DimensionSimulation;
    _updatePosition: Vector3Like;
    constructor(id: number, taskTool: TaskTool);
    getBrush(): SimulationBrush;
    incrementTick(): void;
    getTick(): number;
    addGenerator(generator: Generator): void;
    removeGenerator(generator: Generator): void;
    getUpdatePosition(): Vector3Like;
    addTask(id: string, generationTask: boolean): void;
    getTask(id: string): TaskSegment;
    clearAllTasks(): void;
    clearAll(): void;
    logTasks(): string;
}
export {};
