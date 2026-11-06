import { SameVoxelRelationsConditionData } from "../../State.types";
import { ShapeStateSchemaRelationsCondition } from "./ShapeStateSchemaRelationsCondition";
import { ReltionalStateBuilder } from "../ReltionalStateBuilder";
export declare class SameVoxelCondition extends ShapeStateSchemaRelationsCondition {
    data: SameVoxelRelationsConditionData;
    constructor(builder: ReltionalStateBuilder, data: SameVoxelRelationsConditionData);
    evulate(): boolean;
}
