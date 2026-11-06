import { DimensionSegment } from "../Dimensions/DimensionSegment";
import { SimulationTaskBase, SimulationTaskBaseData } from "./SimulationTaskBase";
export declare class TaskRegister {
    static readonly tasks: SimulationTaskBase[];
    static addTasks(data: SimulationTaskBaseData): SimulationTaskBase;
    static addToDimension(dimension: DimensionSegment): void;
}
