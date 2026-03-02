/**
 * TypeScript interfaces for ivy-lsp visualization endpoint responses.
 *
 * These types mirror the JSON structures returned by the handlers in
 * ivy_lsp/features/visualization.py.  Field names are kept in exact
 * 1:1 correspondence with the Python serialization output.
 */

// ---------------------------------------------------------------------------
// Shared sub-types
// ---------------------------------------------------------------------------

/** Individual requirement, serialized by `_serialize_requirement`. */
export interface RequirementDetail {
    id: string;
    kind: "require" | "ensure" | "assume" | "assert";
    mixin_kind: "before" | "after" | "around" | "implement" | "direct";
    formulaText: string;
    line: number;
    file: string;
    bracketTags: string[];
    stateVarsRead: string[];
    nctClassification: "ASSUMPTION" | "GUARANTEE" | "TESTER_ONLY" | null;
}

/** State variable, serialized by `_serialize_state_var`. */
export interface StateVarDetail {
    name: string;
    qualifiedName: string;
    file: string;
    line: number;
    isRelation: boolean;
}

/** Scope metadata attached to every response. */
export interface ScopeInfo {
    testFile: string | null;
    scoped: boolean;
}

// ---------------------------------------------------------------------------
// ivy/actionRequirements
// ---------------------------------------------------------------------------

/** Per-action requirement breakdown returned by `handle_action_requirements`. */
export interface ActionBoundary {
    actionName: string;
    qualifiedName: string;
    file: string;
    line: number;
    direction: "GENERATED" | "RECEIVED" | "INTERNAL" | null;
    monitors: {
        before: RequirementDetail[];
        after: RequirementDetail[];
        around: RequirementDetail[];
        implement: RequirementDetail[];
        direct: RequirementDetail[];
    } | null;
    stateVarsRead: StateVarDetail[];
    stateVarsWritten: StateVarDetail[];
    rfcTags: string[];
    counts: {
        require: number;
        ensure: number;
        assume: number;
        assert: number;
        total: number;
    };
}

/** Pagination metadata returned by paginated endpoints. */
export interface PaginationInfo {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
}

/** Top-level response for `ivy/actionRequirements`. */
export interface ActionRequirementsResponse {
    actions: ActionBoundary[];
    scopeInfo: ScopeInfo;
    modelReady: boolean;
    pagination?: PaginationInfo;
    error?: string;
    _debug?: string;
    truncated?: boolean;
    totalCount?: number;
}

// ---------------------------------------------------------------------------
// ivy/modelSummaryTable
// ---------------------------------------------------------------------------

/** One row per action in the model summary table. */
export interface ModelSummaryRow {
    actionName: string;
    qualifiedName: string;
    file: string;
    line: number;
    direction: "GENERATED" | "RECEIVED" | "INTERNAL" | null;
    beforeRequireCount: number;
    beforeEnsureCount: number;
    afterRequireCount: number;
    afterEnsureCount: number;
    assumeCount: number;
    assertCount: number;
    totalRequirements: number;
    stateVarsRead: number;
    stateVarsWritten: number;
    rfcTagsCovered: string[];
    rfcCoverageCount: number;
}

/** Aggregated totals across all actions. */
export interface ModelSummaryTotals {
    actions: number;
    requirements: number;
    stateVars: number;
    rfcTagsCovered: number;
    rfcTagsTotal: number;
}

/** Top-level response for `ivy/modelSummaryTable`. */
export interface ModelSummaryResponse {
    rows: ModelSummaryRow[];
    totals: ModelSummaryTotals;
    scopeInfo: ScopeInfo;
    error?: string;
    _debug?: string;
    truncated?: boolean;
    totalCount?: number;
}

// ---------------------------------------------------------------------------
// ivy/coverageGaps
// ---------------------------------------------------------------------------

/** A state variable that is not read by any requirement or property. */
export interface UnguardedStateVar {
    name: string;
    qualifiedName: string;
    file: string;
    line: number;
    isWritten: boolean;
    guardedByRequirements: number;
    severity: "high" | "low";
}

/** An RFC requirement with no matching bracket tag in the model. */
export interface UncoveredRfcRequirement {
    id: string;
    rfc: string;
    section: string;
    level: string;
    text: string;
}

/** A requirement whose monitor_action references a non-existent action. */
export interface OrphanRequirement {
    id: string;
    kind: string;
    formulaText: string;
    file: string;
    line: number;
    reason: string;
}

/** Aggregate counts for coverage gap analysis. */
export interface CoverageGapsSummary {
    totalActions: number;
    totalRequirements: number;
    totalStateVars: number;
    unguardedCount: number;
    totalRfcReqs: number;
    uncoveredRfcCount: number;
    orphanReqCount: number;
}

/** Top-level response for `ivy/coverageGaps`. */
export interface CoverageGapsResponse {
    unguardedStateVars: UnguardedStateVar[];
    uncoveredRfcRequirements: UncoveredRfcRequirement[];
    orphanRequirements: OrphanRequirement[];
    summary: CoverageGapsSummary;
    scopeInfo: ScopeInfo;
    error?: string;
    _debug?: string;
    truncated?: boolean;
    totalCount?: number;
}

// ---------------------------------------------------------------------------
// ivy/actionDependencyGraph
// ---------------------------------------------------------------------------

/** A node in the action dependency graph. */
export interface GraphNode {
    id: string;
    label: string;
    type: "action" | "stateVar";
    file?: string;
    line?: number;
    requirementCount?: number;
}

/** An edge in the action dependency graph. */
export interface GraphEdge {
    source: string;
    target: string;
    label?: string;
    type: "reads" | "writes" | "shared_state";
}

/** Top-level response for `ivy/actionDependencyGraph`. */
export interface ActionDependencyGraphResponse {
    nodes: GraphNode[];
    edges: GraphEdge[];
    truncated?: boolean;
    totalCount?: number;
    scopeInfo: ScopeInfo;
    error?: string;
    _debug?: string;
}

// ---------------------------------------------------------------------------
// ivy/stateMachineView
// ---------------------------------------------------------------------------

/** A node in the state machine view. */
export interface StateMachineNode {
    id: string;
    label: string;
    type: "state" | "invariant";
    file?: string;
    line?: number;
}

/** A transition in the state machine view. */
export interface StateMachineTransition {
    source: string;
    target: string;
    action: string;
    guards: string[];
}

/** Top-level response for `ivy/stateMachineView`. */
export interface StateMachineViewResponse {
    nodes: StateMachineNode[];
    transitions: StateMachineTransition[];
    truncated?: boolean;
    totalCount?: number;
    scopeInfo: ScopeInfo;
    error?: string;
    _debug?: string;
}

// ---------------------------------------------------------------------------
// ivy/layeredOverview
// ---------------------------------------------------------------------------

/** A module/file layer grouping symbols, actions, and state vars. */
export interface LayerGroup {
    file: string | null;
    module: string | null;
    actions: string[];
    stateVars: string[];
    requirements: number;
}

/** Top-level response for `ivy/layeredOverview`. */
export interface LayeredOverviewResponse {
    layers: LayerGroup[];
    scopeInfo: ScopeInfo;
    error?: string;
    _debug?: string;
    truncated?: boolean;
    totalCount?: number;
}

// ---------------------------------------------------------------------------
// ivy/smartSuggestions  (server handler registered at visualization.py:895-979; client not yet wired)
// ---------------------------------------------------------------------------

/** A context-aware suggestion from the semantic model. */
export interface SmartSuggestion {
    type: "state_var" | "missing_guard";
    name: string;
    qualifiedName?: string;
    reason: string;
    priority: "high" | "medium" | "low";
    template?: string;
}

/** Context metadata returned alongside suggestions. */
export interface SmartSuggestionContext {
    file: string;
    line: number;
    action: string | null;
}

/** Top-level response for `ivy/smartSuggestions`. */
export interface SmartSuggestionsResponse {
    suggestions: SmartSuggestion[];
    context: SmartSuggestionContext | null;
    error?: string;
}
