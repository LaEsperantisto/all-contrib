import { DivineVoxelEngineRender } from "Contexts/Render";
import { DVESectionMeshes } from "./Classes/DVESectionMeshes";
export declare abstract class DVERenderer {
    abstract sectorMeshes: DVESectionMeshes;
    abstract init(dver: DivineVoxelEngineRender): Promise<void>;
}
