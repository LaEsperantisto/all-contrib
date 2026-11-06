import { VoxelUpdateData } from "../../Tasks.types";
import { Vec3Array } from "@amodx/math";
import { VoxelPathData } from "../../../Templates/Path/VoxelPath.types";
export default function PaintVoxelPath(dimension: number, [ox, oy, oz]: Vec3Array, voxelPathData: VoxelPathData, updateData: VoxelUpdateData): void;
