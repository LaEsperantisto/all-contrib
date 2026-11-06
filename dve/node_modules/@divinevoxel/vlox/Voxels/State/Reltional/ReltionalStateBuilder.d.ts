import { Vector3Like } from "@amodx/math";
import { VoxelModelRelationsSchemaNodes } from "../State.types";
import { ShapeStateSchemaRelationsCondition } from "./Conditions/ShapeStateSchemaRelationsCondition";
import { VoxelCursorInterface } from "../../Cursor/VoxelCursor.interface";
import { DataCursorInterface } from "../../Cursor/DataCursor.interface";
import { BinarySchema } from "../Schema/BinarySchema";
export declare class ReltionalStateBuilder {
    binarySchema: BinarySchema;
    readonly schemaNodes: VoxelModelRelationsSchemaNodes[];
    name: string;
    position: Vector3Like;
    voxel: VoxelCursorInterface;
    dataCursor: DataCursorInterface;
    nodes: Map<string, ShapeStateSchemaRelationsCondition[]>;
    constructor(binarySchema: BinarySchema, schemaNodes: VoxelModelRelationsSchemaNodes[]);
    buildState(): number;
    getSchema(): VoxelModelRelationsSchemaNodes[];
}
