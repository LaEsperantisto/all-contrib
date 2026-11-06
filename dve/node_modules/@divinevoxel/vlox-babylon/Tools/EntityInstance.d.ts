import { EntityTool } from "./EntityTool.js";
export declare class EntityInstance {
    readonly index: number;
    readonly _tool: EntityTool;
    constructor(index: number, _tool: EntityTool);
    setVisible(visible: boolean): void;
    private syncMatrix;
    setPosition(x: number, y: number, z: number): void;
    setRotation(x: number, y: number, z: number): void;
    setPivot(x: number, y: number, z: number, sync?: boolean): void;
    setData(positionX: number, positionY: number, positionZ: number, scaleX: number, scaleY: number, scaleZ: number, rotationX: number, rotationY: number, rotationZ: number): void;
    destroy(): void;
}
