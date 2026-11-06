export declare enum SectionStateDefaultFlags {
    inProgress = 0,
    logicUpdateInProgress = 1
}
export declare enum SectionStateDefaultTicks {
    displayDirty = 0,
    logicDirty = 1,
    propagationDirty = 2
}
export declare class SectionState {
    /**The default bit flags for sections */
    static Flags: typeof SectionStateDefaultFlags;
    static Ticks: typeof SectionStateDefaultTicks;
    /**A record of bit flags tht are preserved when the section is stored */
    static StoredFlags: Record<string, number>;
}
