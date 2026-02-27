/** TypeScript interfaces for ivy-lsp monitoring endpoint responses. */

export interface ServerStatus {
    mode: "full" | "light";
    version: string;
    uptimeSeconds: number;
    indexingState: "idle" | "indexing" | "error";
    indexingError?: string;
    toolAvailability: {
        ivyCheck: boolean;
        ivyc: boolean;
        ivyShow: boolean;
    };
    activeOperations: ActiveOperation[];
}

export interface ActiveOperation {
    type: string;
    file?: string;
    elapsed: number;
}

export interface IndexerStats {
    fileCount: number;
    symbolCount: number;
    includeEdgeCount: number;
    testScopeCount: number;
    perFileErrors: Array<{ uri: string; error: string }>;
    staleFiles: string[];
    lastIndexTime?: string;
    lastIndexDuration?: number;
}

export interface IncludeGraphNode {
    uri: string;
    symbolCount: number;
    hasErrors: boolean;
}

export interface IncludeGraph {
    nodes: IncludeGraphNode[];
    edges: Array<{ from: string; to: string }>;
}

export interface OperationRecord {
    type: string;
    file?: string;
    startTime: string;
    duration: number;
    success: boolean;
    message: string;
}

export interface OperationHistory {
    operations: OperationRecord[];
}

export interface ActionResult {
    success: boolean;
    message: string;
}
