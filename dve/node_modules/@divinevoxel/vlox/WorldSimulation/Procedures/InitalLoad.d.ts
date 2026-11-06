import { GeneratorData } from "../Dimensions/Generator";
/**# InitalLoad
 * ---
 * Load the world without building.
 */
export declare function InitalLoad(props: {
    dimension?: number;
    logTasks?: true;
    genData: Partial<GeneratorData>;
    buildOnly?: boolean;
}): Promise<unknown>;
