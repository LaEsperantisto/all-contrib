/**# Is Less Than For RGB Remove
 * ---
 * Compares values for the RGB encoded light values.
 * Used for RGB light remove.
 * @param n1
 * @param n2
 */
export declare function isLessThanForRGBRemove(n1: number, n2: number): boolean;
/**# Is Less Than For RGB Add
 * ---
 * Compares values for the RGB encoded light values.
 * Used for RGB light add.
 * @param n1
 * @param n2
 */
export declare function isLessThanForRGBAdd(n1: number, n2: number): boolean;
/**# Is Greater Or Equal Than For RGB Remove
 * ---
 * Compares values for the RGB encoded light values.
 * Used for RGB light remove.
 * @param n1
 * @param n2
 */
export declare function isGreaterOrEqualThanForRGBRemove(n1: number, n2: number): boolean;
/**# Get Minus One For RGB
 * ---
 * Returns the RGB light values minus one.
 * @param sl - source light value
 */
export declare function getMinusOneForRGB(sl: number, nl: number): number;
/**# Remove RGB Light
 * ---
 * Removes all RGB light from an encoded light value.
 * @param sl - source light value
 */
export declare function removeRGBLight(sl: number): number;
/**# Get Full Sun Light
 * --
 * Alters the encoded light number passed to it to give it full sun light.
 * @param sl - source light value
 */
export declare function getFullSunLight(sl: number): number;
/**# Is Less Than For Sun Add
 * ---
 * Used to calculate sun light addition.
 * Used to check all neighbors expect down.
 * @param n1
 * @param n2
 */
export declare function isLessThanForSunAdd(n1: number, n2: number, SRS: number): boolean;
/**# Is Less Than For Sun AddDown
 *
 * Used to calculate sun light addition.
 * Used to check only the down neighbor.
 * @param n1
 * @param n2
 */
export declare function isLessThanForSunAddDown(n1: number, n2: number, SRS: number): boolean;
export declare function isLessThanForSunAddUp(n1: number, n2: number, SRS: number): boolean;
/**# Get Sun Light For Under Voxel
 * ---
 * Gets the sun light value for sun light addition when setting the
 * down neighbor.
 * @param currentVoxel
 */
export declare function getSunLightForUnderVoxel(sl: number, nl: number, SRS: number): number;
/**# Get Minus One For Sun
 * ---
 * Returns the sun light level passed to it minus one.
 * Used for sun light addition on all neighbors expect the down one.
 * @param sl - source light value
 */
export declare function getMinusOneForSun(sl: number, nl: number, SRS: number): number;
/**# Is Less Than For Sun Remove
 * ---
 * Compares two encoded light values sun light values.
 * Used for sun light removal.
 * @param n1
 * @param sl - source light value
 */
export declare function isLessThanForSunRemove(n1: number, sl: number): boolean;
/**# Is Greater Or Equal Than For Sun Remove
 * ---
 * Compares two encoded light values sun light values.
 * Used for sun light removal.
 * @param n1
 * @param sl - source light value
 */
export declare function isGreaterOrEqualThanForSunRemove(n1: number, sl: number): boolean;
/**# Sun Light Compare ForDown Sun Remove
 * ---
 * Compares two encoded light values sun light values.
 * Used for sun light removal in the downward direction only.
 * @param n1
 * @param sl - source light value
 */
export declare function sunLightCompareForDownSunRemove(n1: number, sl: number): boolean;
/**# Remove Sun Light
 * ---
 * Removes the sun light from a light encoded value.
 * @param sl - source light value
 */
export declare function removeSunLight(sl: number): number;
export declare function minusOneForAll(sl: number, SRS: number): number;
