type AllLight = [s: number, r: number, g: number, b: number];
/**# Light Data
 * ---
 * Used to decode light color info.
 */
export declare class VoxelLightData {
    /**The rate at which sun light falls off. RGB light falls off at a default of 1 and sun has a default of 2. */
    static SunFallOffValue: number;
    _lightValues: AllLight;
    sumRGB(value: number): number;
    getS(value: number): number;
    getR(value: number): number;
    getG(value: number): number;
    getB(value: number): number;
    setS(value: number, sl: number): number;
    setR(value: number, sl: number): number;
    setG(value: number, sl: number): number;
    setB(value: number, sl: number): number;
    removeS(sl: number): number;
    hasRGBLight(sl: number): boolean;
    hasSunLight(sl: number): boolean;
    mixLight(l1: number, l2: number): number;
    getRGB(sl: number): number;
    setRGB(value: number, sl: number): number;
    createLightValue(s: number, r: number, g: number, b: number): number;
    /**# Set Light Values
     * ---
     * Give an array of light values it will return an encoded light number.
     * @param values
     */
    setLightValues(values: ArrayLike<number>): number;
    /**# Get Light Values
     * ---
     * Given an encoded light number it will return an array of its values.
     * - 0: Sun Light
     * - 1: Red Light
     * - 2: Green Light
     * - 3: Blue Light
     * @param value
     */
    getLightValuesArray(value: number): AllLight;
    getLightValuesArrayToRef(value: number, values: AllLight): AllLight;
    addLightValues(sl: number, sl2: number): number;
    divideLightValue(sl: number, divisor: number): number;
}
export {};
