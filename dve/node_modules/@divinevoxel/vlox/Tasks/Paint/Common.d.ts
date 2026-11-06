import { VoxelUpdateTask } from "../VoxelUpdateTask.js";
import { VoxelUpdateData } from "../../Tasks/Tasks.types.js";
export declare const updatePowerTask: (tasks: VoxelUpdateTask) => void;
export declare const canUpdate: (x: number, y: number, z: number, data: VoxelUpdateData) => boolean;
/**Checks if the given voxel needs a light update and adds it to the needed queues */
export declare const checkLightUpdate: (x: number, y: number, z: number, tasks: VoxelUpdateTask) => void;
export declare const updateArea: (tasks: VoxelUpdateTask, sx: number, sy: number, sz: number, ex: number, ey: number, ez: number) => void;
