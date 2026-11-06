import { VoxelUpdateData } from "../../Tasks.types";
import { Vec3Array } from "@amodx/math";
import { IVoxelSelectionData } from "../../../Templates/Selection/VoxelSelection";
export default function EraseVoxelSelection(dimension: number, [ox, oy, oz]: Vec3Array, selectionData: IVoxelSelectionData<any>, updateData: VoxelUpdateData): void;
