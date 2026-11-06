import { Threads } from "@amodx/threads/";
import { WorldThreadManager } from "./WorldThreads.js";
/**# Divine Voxel Engine World
 * ---
 * This handles everything in the world worker context.
 */
export declare class DivineVoxelEngineWorld {
    static environment: "node" | "browser";
    static instance: DivineVoxelEngineWorld;
    TC: typeof Threads;
    settings: {
        enviorment: "node" | "browser";
        settings: import("../../Settings/EngineSettings.types.js").EngineSettingsData;
        version: string;
        get doSunPropagation(): boolean;
        get doRGBPropagation(): boolean;
        get doLight(): boolean;
        get doFlow(): boolean;
        get doPower(): boolean;
        getSettings(): import("../../Settings/EngineSettings.types.js").EngineSettingsData;
        syncSettings(data: import("../../Settings/EngineSettings.types.js").EngineSettingsData): void;
        getSettingsCopy(): any;
        createEventListener<K extends "synced">(type: K, listener: EventListenerObject | ((event: CustomEvent<{
            synced: {
                settings: /*elided*/ any;
            };
        }[K]>) => void) | null): EventListenerObject | ((event: CustomEvent<{
            synced: {
                settings: /*elided*/ any;
            };
        }[K]>) => void) | null;
        addEventListener<K extends "synced">(type: K, listener: EventListenerObject | ((event: CustomEvent<{
            synced: {
                settings: /*elided*/ any;
            };
        }[K]>) => void) | null, options?: AddEventListenerOptions): void;
        removeEventListener<K extends "synced">(type: K, listener: EventListenerObject | ((event: CustomEvent<{
            synced: {
                settings: /*elided*/ any;
            };
        }[K]>) => void) | null): void;
        dispatch<K extends "synced">(type: K, detail: {
            synced: {
                settings: /*elided*/ any;
            };
        }[K]): boolean;
        dispatchEvent(event: Event): boolean;
    };
    threads: WorldThreadManager;
    constructor();
}
