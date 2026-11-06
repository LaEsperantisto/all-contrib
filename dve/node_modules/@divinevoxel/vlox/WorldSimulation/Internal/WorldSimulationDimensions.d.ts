import { DimensionSegment } from "../Dimensions/DimensionSegment";
export declare class WorldSimulationDimensions {
    static readonly _dimensions: Map<number, DimensionSegment>;
    static addDimension(dimensionId: number): void;
    static getDimension(dimensionId: number): DimensionSegment;
}
