import { GeoemtryNodeConstructor } from "./Nodes/GeometryNode";
import { VoxelGeometryConstructor } from "./Nodes/VoxelGeometryConstructor";
export declare class VoxelGeometryConstructorRegister {
    static geometry: VoxelGeometryConstructor[];
    static customNodes: Map<string, GeoemtryNodeConstructor<any, any>>;
    static registerCustomNode(id: string, node: GeoemtryNodeConstructor<any, any>): void;
    static getCustomNode(id: string): GeoemtryNodeConstructor<any, any>;
    static init(): void;
}
