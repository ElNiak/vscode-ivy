/** TypeScript interfaces for ivy-lsp monitoring endpoint responses. */

export interface ServerStatus {
    mode: "full" | "light";
    version: string;
    uptimeSeconds: number;
    indexingState: "idle" | "indexing" | "error";
    indexingError?: string;
    initializing?: boolean;
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

export interface FeatureInfo {
    id: string;
    name: string;
    status: "ready" | "degraded" | "unavailable" | "loading";
    reason: string;
    dependsOn?: string[];
}

export interface AnalysisPipelineState {
    tier1FileCount: number;
    tier2FileCount: number;
    tier3FileCount: number;
    tier3Running: boolean;
    tier3Succeeded: number;
    tier3Failed: number;
    tier3Pending: number;
    tier3CurrentFile: string | null;
    tier3LastFile: string | null;
    tier3LastCompletedAt: number | null;
    semanticNodeCount: number;
    semanticEdgeCount: number;
    semanticModelReady: boolean;
    bulkAnalysisRunning: boolean;
    bulkAnalysisTotal: number;
    bulkAnalysisCompleted: number;
}

export interface FeatureStatus {
    features: FeatureInfo[];
    analysisPipeline: AnalysisPipelineState;
}

export interface FileIndexStatus {
    file: string;
    shallowIndexed: boolean;
    deepParseAttempted: boolean;
    deepParseSucceeded: boolean;
    parseError: string | null;
    parseDuration?: number;
}

export interface DeepIndexProgress {
    running: boolean;
    totalTests: number;
    completedTests: number;
    currentFile: string | null;
    startedAt: string | null;
    elapsedSeconds: number | null;
    fileStatusCount?: number;
    fileStatuses?: FileIndexStatus[];
}

export interface Tier3FileResult {
    file: string;
    success: boolean;
    duration: number;
    error: string | null;
}

export interface Tier3Detail {
    running: boolean;
    currentFile: string | null;
    fileCount: number;
    succeeded: number;
    failed: number;
    pending: number;
    lastFile: string | null;
    lastCompletedAt: number | null;
    results?: Tier3FileResult[];
}

export interface CompilationStatus {
    running: boolean;
    total: number;
    completed: number;
    cachedFiles: number;
    activeProcesses: number;
    maxConcurrent: number;
}

export interface AnalysisPipelineDetail {
    tiers: { t1: number; t2: number; t3: number };
    tier3: Tier3Detail;
    compilation: CompilationStatus;
    bulk: { running: boolean; total: number; completed: number };
    semanticModel: { nodeCount: number; edgeCount: number; ready: boolean };
}

export interface TestFeatureEntry {
    file: string;
    features: Record<string, "ready" | "degraded" | "unavailable">;
}

export interface TestFeatureMatrix {
    tests: TestFeatureEntry[];
}

/** Payload of the `ivy/modelReady` server notification. */
export interface ModelReadyNotification {
    actionCount: number;
    requirementCount: number;
}

/** Payload of the `ivy/serverReady` server notification. */
export interface ServerReadyNotification {
    mode: string;
    indexingDuration: number;
}
