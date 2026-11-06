import { SimulationSector } from "./SimulationSector";
export declare class SectorState {
    simSector: SimulationSector;
    isLoaded: boolean;
    isGenerated: boolean;
    genAlldone: boolean;
    allLoaded: boolean;
    nWorldGenAllDone: boolean;
    nDecorAllDone: boolean;
    nSunAllDone: boolean;
    nPropagtionAllDone: boolean;
    constructor(simSector: SimulationSector);
    resset(): void;
    update(): this;
}
