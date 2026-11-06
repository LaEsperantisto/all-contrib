import { Vector3Like, Vector2Like, Vec3Array, Vec2Array } from "@amodx/math";
import { TriangleVerticies } from "../Geometry.types";
type TriangleDataType<Data> = [Data, Data, Data];
export declare class TriangleVertexData<Data> {
    vertices: TriangleDataType<Data>;
    constructor(vertices: TriangleDataType<Data>);
    toArray(): Data[];
    setVertex(vertex: TriangleVerticies, value: Data): void;
    getVertex(vertex: TriangleVerticies): Data;
    setAll(value: Data): void;
    set(v1: Data, v2: Data, v3: Data): void;
    isEqualTo(v1: Data, v2: Data, v3: Data): boolean;
    isAllEqualTo(value: Data): boolean;
    [Symbol.iterator](): Iterator<Data>;
    clone(): TriangleVertexData<Data>;
}
export declare class TriangleVector3VertexData extends TriangleVertexData<Vector3Like> {
    vertices: TriangleDataType<Vector3Like>;
    constructor(vertices?: TriangleDataType<Vector3Like>);
    setFromQuadData(vertexData: TriangleVertexData<Vector3Like>): void;
    addToVertex(vertex: TriangleVerticies, value: Vector3Like): void;
    subtractFromVertex(vertex: TriangleVerticies, value: Vector3Like): void;
    addAll(value: Vector3Like): void;
    subtractAll(value: Vector3Like): void;
    isEqualTo(v1: Vector3Like, v2: Vector3Like, v3: Vector3Like): boolean;
    isAllEqualTo(v1: Vector3Like): boolean;
    clone(): TriangleVector3VertexData;
    toVec3Array(): [Vec3Array, Vec3Array, Vec3Array];
}
export declare class TriangleVector2VertexData extends TriangleVertexData<Vector2Like> {
    vertices: TriangleDataType<Vector2Like>;
    constructor(vertices?: TriangleDataType<Vector2Like>);
    setFromQuadData(vertexData: TriangleVertexData<Vector3Like>): void;
    addToVertex(vertex: TriangleVerticies, value: Vector2Like): void;
    subtractFromVertex(vertex: TriangleVerticies, value: Vector2Like): void;
    addAll(value: Vector2Like): void;
    subtractAll(value: Vector2Like): void;
    isEqualTo(v1: Vector2Like, v2: Vector2Like, v3: Vector2Like): boolean;
    isAllEqualTo(v1: Vector2Like): boolean;
    toVec2Array(): [Vec2Array, Vec2Array, Vec2Array];
    clone(): TriangleVector2VertexData;
}
export declare class TriangleScalarVertexData extends TriangleVertexData<number> {
    vertices: TriangleDataType<number>;
    constructor(vertices?: TriangleDataType<number>);
    setFromQuadData(vertexData: TriangleVertexData<number>): void;
    subtractFromVertex(vertex: TriangleVerticies, value: number): void;
    addAll(value: number): void;
    add(v1: number, v2: number, v3: number, v4: number): void;
    subtractAll(value: number): void;
    subtract(v1: number, v2: number, v3: number, v4: number): void;
    isGreaterThan(v1: number, v2: number, v3: number, v4: number): boolean;
    isAllGreaterThan(value: number): boolean;
    isLessThan(v1: number, v2: number, v3: number, v4: number): boolean;
    isAllLessThan(value: number): boolean;
    clone(): TriangleScalarVertexData;
}
export {};
