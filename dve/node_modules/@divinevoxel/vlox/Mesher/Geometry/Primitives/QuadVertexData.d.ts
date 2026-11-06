import { QuadVerticies } from "../Geometry.types.js";
import { Vector3Like, Vector2Like, Vec3Array, Vec2Array } from "@amodx/math";
type QuadDataType<Data> = [Data, Data, Data, Data];
export declare class QuadVertexData<Data> {
    vertices: QuadDataType<Data>;
    constructor(vertices: QuadDataType<Data>);
    toArray(): Data[];
    setVertex(vertex: QuadVerticies, value: Data): void;
    getVertex(vertex: QuadVerticies): Data;
    setAll(value: Data): void;
    set(v1: Data, v2: Data, v3: Data, v4: Data): void;
    isEqualTo(v1: Data, v2: Data, v3: Data, v4: Data): boolean;
    isAllEqualTo(value: Data): boolean;
    [Symbol.iterator](): Iterator<Data>;
    clone(): QuadVertexData<Data>;
}
export declare class QuadVector3VertexData extends QuadVertexData<Vector3Like> {
    vertices: QuadDataType<Vector3Like>;
    constructor(vertices?: QuadDataType<Vector3Like>);
    setFromQuadData(vertexData: QuadVertexData<Vector3Like>): void;
    addToVertex(vertex: QuadVerticies, value: Vector3Like): void;
    subtractFromVertex(vertex: QuadVerticies, value: Vector3Like): void;
    addAll(value: Vector3Like): void;
    subtractAll(value: Vector3Like): void;
    isEqualTo(v1: Vector3Like, v2: Vector3Like, v3: Vector3Like, v4: Vector3Like): boolean;
    isAllEqualTo(v1: Vector3Like): boolean;
    clone(): QuadVector3VertexData;
    toVec3Array(): [Vec3Array, Vec3Array, Vec3Array, Vec3Array];
}
export declare class QuadVector2VertexData extends QuadVertexData<Vector2Like> {
    vertices: QuadDataType<Vector2Like>;
    constructor(vertices?: QuadDataType<Vector2Like>);
    setFromQuadData(vertexData: QuadVertexData<Vector3Like>): void;
    addToVertex(vertex: QuadVerticies, value: Vector2Like): void;
    subtractFromVertex(vertex: QuadVerticies, value: Vector2Like): void;
    addAll(value: Vector2Like): void;
    subtractAll(value: Vector2Like): void;
    isEqualTo(v1: Vector2Like, v2: Vector2Like, v3: Vector2Like, v4: Vector2Like): boolean;
    isAllEqualTo(v1: Vector2Like): boolean;
    toVec2Array(): [Vec2Array, Vec2Array, Vec2Array, Vec2Array];
    clone(): QuadVector2VertexData;
}
export declare class QuadScalarVertexData extends QuadVertexData<number> {
    vertices: QuadDataType<number>;
    constructor(vertices?: QuadDataType<number>);
    setFromQuadData(vertexData: QuadVertexData<number>): void;
    subtractFromVertex(vertex: QuadVerticies, value: number): void;
    addAll(value: number): void;
    add(v1: number, v2: number, v3: number, v4: number): void;
    subtractAll(value: number): void;
    subtract(v1: number, v2: number, v3: number, v4: number): void;
    isGreaterThan(v1: number, v2: number, v3: number, v4: number): boolean;
    isAllGreaterThan(value: number): boolean;
    isLessThan(v1: number, v2: number, v3: number, v4: number): boolean;
    isAllLessThan(value: number): boolean;
    clone(): QuadScalarVertexData;
}
export {};
