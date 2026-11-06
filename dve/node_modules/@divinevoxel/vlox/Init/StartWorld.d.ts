import { DivineVoxelEngineWorld } from "../Contexts/World/DivineVoxelEngineWorld";
import { WorldStorageInterface } from "World/Types/WorldStorage.interface";
type StartWorldProps = {
    worldStorage?: WorldStorageInterface;
};
export declare function StartWorld(props?: StartWorldProps): Promise<DivineVoxelEngineWorld>;
export {};
