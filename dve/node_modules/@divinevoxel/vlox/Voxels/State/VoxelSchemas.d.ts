import { ReltionalStateBuilder } from "./Reltional/ReltionalStateBuilder";
import { BinarySchema } from "./Schema/BinarySchema";
import { VoxelBinaryStateSchemaNode, VoxelModelRelationsSchemaNodes } from "./State.types";
export type VoxelSchemasExport = {
    state: [key: string, VoxelBinaryStateSchemaNode[]][];
    mod: [key: string, VoxelBinaryStateSchemaNode[]][];
    relationalState: [key: string, VoxelBinaryStateSchemaNode[]][];
    reltionalStateBuilder: [key: string, VoxelModelRelationsSchemaNodes[]][];
    relationalMod: [key: string, VoxelBinaryStateSchemaNode[]][];
    reltionalModBuilder: [key: string, VoxelModelRelationsSchemaNodes[]][];
};
export declare class VoxelSchemas {
    static state: Map<string, BinarySchema>;
    static stateMap: BinarySchema[];
    static mod: Map<string, BinarySchema>;
    static modMap: BinarySchema[];
    static relationalState: Map<string, BinarySchema>;
    static relationalStateMap: BinarySchema[];
    static reltionalStateBuilder: Map<string, ReltionalStateBuilder>;
    static reltionalStateBuilderMap: ReltionalStateBuilder[];
    static relationalMod: Map<string, BinarySchema>;
    static relationalModMap: BinarySchema[];
    static reltionalModBuilder: Map<string, ReltionalStateBuilder>;
    static reltionalModBuilderMap: ReltionalStateBuilder[];
    static getStateSchema(voxelId: string): BinarySchema | undefined;
    static buildMaps(): void;
    static export(): VoxelSchemasExport;
    static import(exported: VoxelSchemasExport): void;
}
