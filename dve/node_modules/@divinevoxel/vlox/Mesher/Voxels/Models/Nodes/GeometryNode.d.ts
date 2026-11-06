import { VoxelModelBuilder } from "../VoxelModelBuilder";
import { VoxelGeometryConstructor } from "./VoxelGeometryConstructor";
export interface GeoemtryNodeConstructor<Data = any, Args = any> {
    new (geometryPaletteId: number, geometry: VoxelGeometryConstructor, data: Data): GeoemtryNode<Data, Args>;
}
export declare abstract class GeoemtryNode<Data = any, Args = any> {
    geometryPaletteId: number;
    geometry: VoxelGeometryConstructor;
    data: Data;
    builder: VoxelModelBuilder;
    constructor(geometryPaletteId: number, geometry: VoxelGeometryConstructor, data: Data);
    abstract init(): void;
    abstract add(args: Args): boolean;
}
