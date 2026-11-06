interface Node {
    priority: number;
}
export declare class PriorityQueue<T extends Node> {
    private heap;
    private parentIndex;
    private leftChildIndex;
    private rightChildIndex;
    private swap;
    enqueue(item: T): void;
    dequeue(): T | undefined;
    peek(): T | undefined;
    private heapifyUp;
    private heapifyDown;
    isEmpty(): boolean;
    size(): number;
}
export {};
