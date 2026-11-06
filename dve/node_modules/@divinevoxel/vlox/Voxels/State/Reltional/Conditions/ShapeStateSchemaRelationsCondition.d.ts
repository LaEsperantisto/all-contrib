import { ReltionalStateBuilder } from "../ReltionalStateBuilder";
export declare abstract class ShapeStateSchemaRelationsCondition {
    builder: ReltionalStateBuilder;
    constructor(builder: ReltionalStateBuilder);
    abstract evulate(): boolean;
}
