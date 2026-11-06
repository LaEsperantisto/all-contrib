/**
 * A class to help with indexing a full flat binary tree defined by the number of levels it has.
 */
export declare class FlatBinaryTreeIndex {
    levels: number;
    constructor(levels: number);
    /** Gets the number of nodes at a level of the tree */
    getLevelSize(level: number): number;
    /**
     * Gets the flat index of a node indexed by the level it's on and its relative index in that level.
     */
    getIndexAtLevel(level: number, node: number): number;
    /**
     * Gets the level and relative index of a node's flat index.
     */
    getLevelAndIndex(index: number): [level: number, relativeIndex: number];
    /**
     * Gets the flat left child of a node, where the node is indexed by its level and its relative index at that level.
     * @returns -1 if no child exist
     */
    getLeftChildAtLevel(level: number, node: number): number;
    /**
     * Gets the flat right child of a node, where the node is indexed by its level and its relative index at that level.
     * @returns -1 if no child exist
     */
    getRightChildAtLevel(level: number, node: number): number;
    /**
     * Gets the flat index of the parent of a node, where the node is indexed by its level and its relative index at that level.
     * @returns -1 if level has no parent
     */
    getParentAtLevel(level: number, node: number): number;
    /** Gets the flat index of the left child of the node.
     * @returns -1 if no child exist
     */
    getLeftChild(node: number): number;
    /** Gets the flat index of the right child of the node.
     * @returns -1 if no child exist
     */
    getRightChild(node: number): number;
    /** Gets the flat index of the parent of the node.
     * @returns -1 if no parent exist
     */
    getParent(node: number): number;
    /** Gets the total number of nodes in the tree */
    getTotalSize(): number;
}
