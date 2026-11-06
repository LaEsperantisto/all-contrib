import { Thread } from "@amodx/threads/";
import { WorldStorageInterface } from "./Types/WorldStorage.interface.js";
export default function ({ threads, worldStorage, }: {
    threads: Thread[];
    worldStorage?: WorldStorageInterface;
}): void;
