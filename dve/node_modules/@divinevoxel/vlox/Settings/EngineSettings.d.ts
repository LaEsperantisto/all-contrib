import { EngineSettingsData } from "./EngineSettings.types.js";
import { TypedEventTarget } from "../Util/TypedEventTarget.js";
type EngineSettingsEvents = {
    synced: {
        settings: EngineSettingsClass;
    };
};
/**# Engine Settings
 * ---
 * Handles common settings for all contexts
 */
declare class EngineSettingsClass extends TypedEventTarget<EngineSettingsEvents> {
    enviorment: "node" | "browser";
    settings: EngineSettingsData;
    version: string;
    get doSunPropagation(): boolean;
    get doRGBPropagation(): boolean;
    get doLight(): boolean;
    get doFlow(): boolean;
    get doPower(): boolean;
    getSettings(): EngineSettingsData;
    syncSettings(data: EngineSettingsData): void;
    getSettingsCopy(): any;
}
export declare const EngineSettings: EngineSettingsClass;
export {};
