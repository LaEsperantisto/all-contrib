export declare class TypedEventTarget<T extends Record<string, any>> extends EventTarget {
    createEventListener<K extends keyof T>(type: K, listener: ((event: CustomEvent<T[K]>) => void) | EventListenerObject | null): ((event: CustomEvent<T[K]>) => void) | EventListenerObject | null;
    addEventListener<K extends keyof T>(type: K, listener: ((event: CustomEvent<T[K]>) => void) | EventListenerObject | null, options?: AddEventListenerOptions): void;
    removeEventListener<K extends keyof T>(type: K, listener: ((event: CustomEvent<T[K]>) => void) | EventListenerObject | null): void;
    dispatch<K extends keyof T>(type: K, detail: T[K]): boolean;
}
