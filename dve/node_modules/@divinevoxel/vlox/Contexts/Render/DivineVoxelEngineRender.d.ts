import { Threads } from "@amodx/threads/";
import type { EngineSettingsData } from "../../Settings/EngineSettings.types.js";
import type { RecursivePartial } from "../../Util/Util.types.js";
import { DVERenderer } from "../../Renderer/DVERenderer.js";
import { MeshManager } from "../../Renderer/MeshManager.js";
import { MeshRegister } from "../../Renderer/MeshRegister.js";
import { DVERenderThreads } from "./DVERenderThreads.js";
type PartialEngineSettings = RecursivePartial<EngineSettingsData>;
export interface DVERInitData extends PartialEngineSettings {
    worldWorker: Worker;
    mesherWorkers: Worker[];
    generatorWorkers: Worker[];
    renderer: DVERenderer;
    nexusWorker?: Worker;
}
export declare class DivineVoxelEngineRender {
    static instance: DivineVoxelEngineRender;
    static initialized: boolean;
    TC: typeof Threads;
    settings: {
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
    meshManager: typeof MeshManager;
    meshRegister: typeof MeshRegister;
    renderer: DVERenderer;
    threads: DVERenderThreads;
    constructor();
    /**# clearAll
     *---
     * Clear all world data and meshes.
     */
    clearAll(): Promise<void>;
}
export {};
