import { WorldGenRegister } from "./WorldGenRegister.js";
import { WorldGenBrush } from "./WorldGenBrush.js";
import { WorldGenInterface } from "./WorldGen.types.js";
import { LocationData } from "../../Math/index.js";
export declare class WorldGeneration {
    static worldGen: WorldGenInterface | null;
    static register: typeof WorldGenRegister;
    static _brushes: any[];
    static setWorldGen(worldGen: WorldGenInterface): void;
    static generate(data: Readonly<LocationData>, mode: "generate" | "decorate", onDone: Function): Promise<void>;
    static getBrush(): WorldGenBrush;
}
