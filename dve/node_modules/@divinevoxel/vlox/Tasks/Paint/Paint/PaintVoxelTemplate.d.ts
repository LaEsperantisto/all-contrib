import { VoxelUpdateData } from "../../Tasks.types";
import { Vec3Array } from "@amodx/math";
import { IVoxelTemplateData } from "../../../Templates/VoxelTemplates.types";
export default function PaintVoxelTemplate(dimension: number, [ox, oy, oz]: Vec3Array, templateData: IVoxelTemplateData<any>, updateData: VoxelUpdateData): void;
