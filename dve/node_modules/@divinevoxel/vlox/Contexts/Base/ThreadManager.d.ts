import { Thread, ThreadPool, ThreadPortTypes } from "@amodx/threads";
export declare abstract class ThreadManager {
    threadMap: Map<string, Thread | ThreadPool>;
    _threads: (Thread | ThreadPool)[];
    constructor();
    setThreadPort(id: string, ports: ThreadPortTypes | ThreadPortTypes[]): void;
    addThread(thread: Thread | ThreadPool): void;
    getThread(id: string): Thread | ThreadPool;
}
