import { DivineVoxelEngineRender, DVERInitData } from "../Contexts/Render";
import { InitVoxelDataProps } from "../Voxels/InitVoxelData";
import { WorkItemProgress } from "../Util/WorkItemProgress";
type StartRendererProps = {
    getProgress?: (progress: WorkItemProgress) => void;
} & DVERInitData & InitVoxelDataProps;
export declare function StartRenderer(initData: StartRendererProps): Promise<DivineVoxelEngineRender>;
export {};
