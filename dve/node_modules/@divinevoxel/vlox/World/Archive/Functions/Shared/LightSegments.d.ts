import { ArchivedLightSegments } from "../../Types/Archive.types";
export declare const lightSegments: ArchivedLightSegments[];
export declare const lightSemgnetGet: Record<ArchivedLightSegments, (value: number) => number>;
export declare const lightSemgnetSet: Record<ArchivedLightSegments, (value: number, source: number) => number>;
export declare function getLightBuffer(light: ArchivedLightSegments, buffer: Uint16Array): Uint8Array<ArrayBuffer>;
