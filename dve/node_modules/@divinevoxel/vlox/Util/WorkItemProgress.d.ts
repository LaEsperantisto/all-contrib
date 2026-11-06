type ProgressUpdateFunction = (completed: number, status: string) => void;
type ProgressTaskFunction = (task: string) => void;
export declare class WorkItemProgress {
    private _currentStatus;
    private _compltedWorkItems;
    private _workItems;
    private _onUpdate;
    private _startTask;
    private _endTask;
    private _currentTask;
    private _dispatchUpdate;
    get compltedWorkItems(): number;
    onStartTask(run: ProgressTaskFunction): void;
    onEndTask(run: ProgressTaskFunction): void;
    startTask(id: string): void;
    endTask(): void;
    setWorkLoad(amount: number): void;
    onUpdate(run: ProgressUpdateFunction): void;
    completeWorkItems(amount: number): void;
    setStatus(status: string): void;
    wait(time: number): Promise<unknown>;
}
export {};
