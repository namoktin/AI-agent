/**
 * StateGraph.js - Stateful Task Graph Execution Engine
 * Supports: DAG, Conditional Branching, Controlled Loops with Max Iterations,
 * Node Checkpointing, Idempotency Guard, Parallel Branch Execution, and Dynamic Replanning.
 * 
 * Cyber Agent Pro v5.0 Enterprise
 */

const EventEmitter = require('events');

class StateNode {
    constructor(config = {}) {
        this.id = config.id || config.nodeId || `node_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        this.type = config.type || 'task'; // 'task' | 'agent' | 'tool' | 'decision' | 'human_approval' | 'verification'
        this.status = config.status || 'PENDING'; // 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'WAITING_APPROVAL'
        this.description = config.description || '';
        this.assignedTo = config.assignedTo || 'developer'; // 'director' | 'coordinator' | 'developer' | 'researcher' | 'critic'
        
        // Dependencies & Conditions
        this.dependencies = Array.isArray(config.dependencies)
            ? [...config.dependencies]
            : (Array.isArray(config.prerequisites) ? [...config.prerequisites] : []);
        this.prerequisites = this.dependencies;
        this.condition = typeof config.condition === 'function' ? config.condition : null; // Start condition
        this.acceptanceCriteria = Array.isArray(config.acceptanceCriteria) ? [...config.acceptanceCriteria] : [];
        this.action = typeof config.action === 'function' ? config.action : null;
        this.requiresApproval = Boolean(config.requiresApproval || config.type === 'human_approval');
        this.approvalDescription = config.approvalDescription || config.description || '';
        this.transitions = Array.isArray(config.transitions) ? config.transitions : [];
        
        // Input/Output Schemas & Data
        this.input = config.input || {};
        this.output = config.output || null;
        this.evidence = config.evidence || null; // Verification evidence
        
        // Resilience & Budgeting
        this.maxRetries = typeof config.maxRetries === 'number' ? config.maxRetries : 2;
        this.retryCount = typeof config.retryCount === 'number' ? config.retryCount : 0;
        this.backoffMs = config.backoffMs || 1000;
        this.timeoutMs = config.timeoutMs || 45000;
        this.budgetTokens = config.budgetTokens || 15000;
        this.tokensUsed = typeof config.tokensUsed === 'number' ? config.tokensUsed : 0;
        
        // Idempotency & Checkpointing
        this.idempotent = config.idempotent !== false; // Default true
        this.idempotentKey = config.idempotentKey || `${this.id}_${this.type}`;
        this.checkpointable = config.checkpointable !== false;
        this.executedSuccessfully = Boolean(config.executedSuccessfully);
        
        // Loop control
        this.loopIteration = typeof config.loopIteration === 'number' ? config.loopIteration : 0;
        this.maxLoopIterations = typeof config.maxLoopIterations === 'number' ? config.maxLoopIterations : (config.maxLoops || 3);

        // Custom task payload
        this.taskPayload = config.taskPayload || {};
    }

    canExecute(completedNodeIds = new Set(), state = {}) {
        if (this.status === 'COMPLETED' && this.idempotent && this.executedSuccessfully) {
            return false;
        }
        if (this.status === 'RUNNING' || this.status === 'WAITING_APPROVAL' || this.status === 'WAITING_QUOTA') {
            return false;
        }

        // All dependencies must be in completedNodeIds
        const depsMet = this.dependencies.every(depId => completedNodeIds.has(depId));
        if (!depsMet) return false;

        // Condition check if defined
        if (this.condition) {
            try {
                return Boolean(this.condition(state));
            } catch (e) {
                return false;
            }
        }

        return true;
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            status: this.status,
            description: this.description,
            assignedTo: this.assignedTo,
            dependencies: this.dependencies,
            acceptanceCriteria: this.acceptanceCriteria,
            requiresApproval: this.requiresApproval,
            approvalDescription: this.approvalDescription,
            input: this.input,
            output: this.output,
            evidence: this.evidence,
            retryCount: this.retryCount,
            maxRetries: this.maxRetries,
            timeoutMs: this.timeoutMs,
            budgetTokens: this.budgetTokens,
            tokensUsed: this.tokensUsed,
            idempotent: this.idempotent,
            executedSuccessfully: this.executedSuccessfully,
            loopIteration: this.loopIteration,
            maxLoopIterations: this.maxLoopIterations,
            taskPayload: this.taskPayload
        };
    }
}

class StateGraph extends EventEmitter {
    constructor(config = {}) {
        super();
        this.graphId = config.graphId || `graph_${Date.now()}`;
        this.nodes = new Map(); // nodeId -> StateNode
        this.edges = []; // [{ from, to, conditionFn }]
        this.conditionalLoops = []; // [{ fromNode, toNode, conditionFn, maxLoops }]
        
        // Global State & History
        this.state = config.initialState ? { ...config.initialState } : {};
        this.completedNodes = new Set();
        this.failedNodes = new Set();
        this.executionHistory = [];
        
        // Runtime Controls
        this.maxParallelNodes = config.maxParallelNodes || 5;
        this.maxTotalSteps = config.maxTotalSteps || 50;
        this.stepCounter = 0;
        this.status = 'IDLE'; // 'IDLE' | 'RUNNING' | 'PAUSED' | 'WAITING_APPROVAL' | 'COMPLETED' | 'FAILED'
        
        // Optional references
        this.checkpointManager = config.checkpointManager || null;
        this.verifier = config.verifier || null;
        this.eventStream = config.eventStream || null;
        this.maxLoops = config.maxLoops || 3;
        this.executionLog = [];
    }

    addNode(nodeConfig) {
        const node = nodeConfig instanceof StateNode ? nodeConfig : new StateNode(nodeConfig);
        this.nodes.set(node.id, node);

        // Auto-wire dependencies from prerequisites
        if (Array.isArray(node.dependencies)) {
            for (const depId of node.dependencies) {
                if (this.nodes.has(depId)) {
                    this.addEdge(depId, node.id);
                }
            }
        }

        // Auto-wire transitions as loops or edges
        if (Array.isArray(node.transitions)) {
            for (const t of node.transitions) {
                const target = t.targetNodeId || t.to;
                if (target === node.id || t.loop) {
                    this.addConditionalLoop(node.id, target, t.condition, t.maxLoops || this.maxLoops);
                } else {
                    this.addEdge(node.id, target, t.condition);
                }
            }
        }

        return node;
    }

    addEdge(fromId, toId, conditionFn = null) {
        if (!this.nodes.has(fromId)) {
            throw new Error(`StateGraph: fromNode '${fromId}' does not exist.`);
        }
        if (!this.nodes.has(toId)) {
            throw new Error(`StateGraph: toNode '${toId}' does not exist.`);
        }

        // Add to dependency list of target node if no condition or default DAG
        const toNode = this.nodes.get(toId);
        if (!toNode.dependencies.includes(fromId)) {
            toNode.dependencies.push(fromId);
        }

        this.edges.push({ from: fromId, to: toId, condition: conditionFn });
        return this;
    }

    addConditionalLoop(fromNodeId, toNodeId, conditionFn, maxLoops = 3) {
        if (!this.nodes.has(fromNodeId) || !this.nodes.has(toNodeId)) {
            throw new Error(`StateGraph: Invalid loop endpoints: ${fromNodeId} -> ${toNodeId}`);
        }
        this.conditionalLoops.push({
            from: fromNodeId,
            to: toNodeId,
            condition: conditionFn,
            maxLoops,
            currentLoops: 0
        });
        return this;
    }

    getReadyNodes() {
        const ready = [];
        for (const [id, node] of this.nodes.entries()) {
            if (node.status === 'PENDING' && node.canExecute(this.completedNodes, this.state)) {
                ready.push(node);
            }
        }
        return ready;
    }

    /**
     * Execute graph with full lifecycle, parallelism and checkpointing
     */
    async run(executorFn = null, options = {}) {
        let actualExecutor = executorFn;
        if (typeof actualExecutor !== 'function') {
            actualExecutor = async (node, state, graph, executionContext = {}) => {
                if (typeof node.action === 'function') {
                    node.abortSignal = executionContext.signal || null;
                    if (node.action.length >= 4) {
                        return await node.action(node, state, graph, executionContext);
                    } else if (node.action.length === 3) {
                        return await node.action(node, state, graph);
                    }
                    return await node.action(state, graph);
                }
                return { success: true };
            };
        }

        this.status = 'RUNNING';
        this.emit('GRAPH_STARTED', { graphId: this.graphId, state: this.state });

        // Synchronize granted approvals from eventStream before evaluating ready nodes
        for (const node of this.nodes.values()) {
            if (node.status === 'WAITING_APPROVAL' && this.eventStream) {
                const dec = this.eventStream.getApprovalDecision(this.graphId, node.id);
                if (dec === 'APPROVED') {
                    node.status = 'PENDING';
                    node.requiresApproval = false;
                } else if (dec === 'REJECTED') {
                    node.status = 'FAILED';
                    this.failedNodes.add(node.id);
                }
            } else if (node.status === 'WAITING_QUOTA') {
                // Tự động chuyển node WAITING_QUOTA sang PENDING để thực thi khi khởi động lại luồng
                node.status = 'PENDING';
            }
        }

        try {
            while (this.status === 'RUNNING' && this.stepCounter < this.maxTotalSteps) {
                const readyNodes = this.getReadyNodes();

                if (readyNodes.length === 0) {
                    // Check if all nodes are completed or waiting approval / waiting quota
                    const pendingNodes = Array.from(this.nodes.values()).filter(n => n.status === 'PENDING');
                    const runningNodes = Array.from(this.nodes.values()).filter(n => n.status === 'RUNNING');
                    const waitingApproval = Array.from(this.nodes.values()).filter(n => n.status === 'WAITING_APPROVAL');
                    const waitingQuota = Array.from(this.nodes.values()).filter(n => n.status === 'WAITING_QUOTA');

                    if (waitingApproval.length > 0) {
                        this.status = 'WAITING_APPROVAL';
                        this.emit('GRAPH_WAITING_APPROVAL', {
                            graphId: this.graphId,
                            waitingNodes: waitingApproval.map(n => n.id),
                            state: this.state
                        });
                        break;
                    }

                    // TẠM HOÃN AN TOÀN DO QUOTA (Fix Lỗi A): Nếu node đang chờ cấp quota, dừng đồ thị sạch sẽ
                    if (waitingQuota.length > 0) {
                        this.status = 'WAITING_QUOTA';
                        this.emit('GRAPH_WAITING_QUOTA', {
                            graphId: this.graphId,
                            waitingNodes: waitingQuota.map(n => n.id),
                            state: this.state
                        });
                        break;
                    }

                    if (pendingNodes.length === 0 && runningNodes.length === 0) {
                        if (this.failedNodes.size > 0) {
                            this.status = 'FAILED';
                            this.emit('GRAPH_FAILED', {
                                graphId: this.graphId,
                                reason: `${this.failedNodes.size} node(s) failed without recovery`,
                                failedNodes: Array.from(this.failedNodes)
                            });
                        } else {
                            // All reachable nodes completed!
                            this.status = 'COMPLETED';
                        }
                        break;
                    }

                    // If pending nodes exist but none are ready, and no nodes running -> Deadlock / Blocked dependencies
                    if (runningNodes.length === 0 && pendingNodes.length > 0) {
                        const blockedDueToFailure = pendingNodes.some(p => 
                            p.dependencies.some(d => this.failedNodes.has(d))
                        );

                        if (blockedDueToFailure) {
                            this.status = 'FAILED';
                            this.emit('GRAPH_FAILED', {
                                graphId: this.graphId,
                                reason: 'Dependencies blocked by failed node',
                                failedNodes: Array.from(this.failedNodes)
                            });
                        } else {
                            this.status = 'FAILED';
                            this.emit('GRAPH_FAILED', {
                                graphId: this.graphId,
                                reason: 'Deadlock: Pending nodes exist but none meet prerequisites'
                            });
                        }
                        break;
                    }

                    // Wait a tick for active running nodes
                    await new Promise(r => setTimeout(r, 50));
                    continue;
                }

                // Execute ready nodes concurrently up to maxParallelNodes
                const batch = readyNodes.slice(0, this.maxParallelNodes);
                this.stepCounter += batch.length;

                const batchPromises = batch.map(node => this._executeNodeWithGuard(node, actualExecutor));
                await Promise.all(batchPromises);

                // Save checkpoint after each parallel wave
                if (this.checkpointManager && typeof this.checkpointManager.saveCheckpoint === 'function') {
                    try {
                        this.checkpointManager.saveCheckpoint(this.graphId, `graph_step_${this.stepCounter}`, this.serialize());
                    } catch (e) {}
                }
            }

            if (this.stepCounter >= this.maxTotalSteps && this.status === 'RUNNING') {
                this.status = 'FAILED';
                this.emit('GRAPH_FAILED', { graphId: this.graphId, reason: 'Exceeded maxTotalSteps limit' });
            }

            if (this.status === 'COMPLETED' && this.failedNodes.size > 0) {
                this.status = 'FAILED';
            }

            if (this.status === 'COMPLETED') {
                this.emit('GRAPH_COMPLETED', { graphId: this.graphId, state: this.state });
            }

            const waitingNode = Array.from(this.nodes.values()).find(n => n.status === 'WAITING_APPROVAL');
            const waitingQuotaNode = Array.from(this.nodes.values()).find(n => n.status === 'WAITING_QUOTA');
            return {
                status: this.status,
                state: this.state,
                completedNodes: Array.from(this.completedNodes),
                failedNodes: Array.from(this.failedNodes),
                waitingApprovalNode: waitingNode ? waitingNode.id : null,
                waitingQuotaNode: waitingQuotaNode ? waitingQuotaNode.id : null,
                executionLog: this.executionLog,
                stepCounter: this.stepCounter
            };

        } catch (err) {
            this.status = 'FAILED';
            this.emit('GRAPH_ERROR', { graphId: this.graphId, error: err.message });
            throw err;
        }
    }

    async _executeNodeWithGuard(node, executorFn) {
        // Idempotency check: If already executed successfully and idempotent, skip
        if (node.idempotent && node.executedSuccessfully && this.completedNodes.has(node.id)) {
            this.emit('NODE_SKIPPED_IDEMPOTENT', { nodeId: node.id });
            return node.output;
        }

        // Check if node requires human approval (HITL)
        if (node.requiresApproval && node.status !== 'APPROVED') {
            if (this.eventStream && typeof this.eventStream.getApprovalDecision === 'function') {
                const dec = this.eventStream.getApprovalDecision(this.graphId, node.id);
                if (dec === 'APPROVED') {
                    node.status = 'APPROVED';
                }
            }
        }

        if (node.requiresApproval && node.status !== 'APPROVED') {
            node.status = 'WAITING_APPROVAL';
            this.status = 'WAITING_APPROVAL';
            this.executionLog.push(`[${node.id}] WAITING_APPROVAL: ${node.approvalDescription || node.description}`);

            // Lưu checkpoint ngay lập tức khi dừng chờ duyệt để sẵn sàng khôi phục nếu server restart
            if (this.checkpointManager && typeof this.checkpointManager.saveCheckpoint === 'function') {
                try {
                    this.checkpointManager.saveCheckpoint(this.graphId, 'waiting_approval', this.serialize());
                } catch (e) {}
            }

            if (this.eventStream && typeof this.eventStream.requestApproval === 'function') {
                this.eventStream.requestApproval(this.graphId, node.id, node.approvalDescription || node.description, node.input);
            }
            this.emit('NODE_WAITING_APPROVAL', {
                nodeId: node.id,
                description: node.approvalDescription || node.description,
                input: node.input,
                state: this.state
            });
            return null;
        }

        node.status = 'RUNNING';
        this.emit('NODE_STARTED', { nodeId: node.id, type: node.type, assignedTo: node.assignedTo });

        let attempt = 0;
        let lastError = null;

        while (attempt <= node.maxRetries) {
            attempt++;
            node.retryCount = attempt - 1;

            const abortController = new AbortController();
            let timeoutTimer = null;
            const timeoutPromise = new Promise((_, reject) => {
                timeoutTimer = setTimeout(() => {
                    const timeoutErr = new Error(`Node [${node.id}] timed out after ${node.timeoutMs}ms`);
                    abortController.abort(timeoutErr);
                    reject(timeoutErr);
                }, node.timeoutMs);
            });

            try {
                const executionContext = {
                    signal: abortController.signal,
                    abortController,
                    attempt,
                    graphId: this.graphId
                };

                const result = await Promise.race([
                    executorFn(node, this.state, this, executionContext),
                    timeoutPromise
                ]);

                // XỬ LÝ QUOTA WAITING (LỖI A): Nếu API kiệt quota, tạm hoãn node và graph sạch sẽ, không tính lỗi, không hao retry
                if (result?.status === 'QUOTA_WAITING' || result?.quotaDeferred) {
                    node.status = 'WAITING_QUOTA';
                    this.status = 'WAITING_QUOTA';
                    this.executionLog.push(`[${node.id}] WAITING_QUOTA: API quota saturated, node safely paused for replenishment.`);

                    if (this.checkpointManager && typeof this.checkpointManager.saveCheckpoint === 'function') {
                        try {
                            this.checkpointManager.saveCheckpoint(this.graphId, 'waiting_quota', this.serialize());
                        } catch (e) {}
                    }

                    if (this.eventStream && typeof this.eventStream.emitEvent === 'function') {
                        this.eventStream.emitEvent(this.graphId, 'QUOTA_WAITING', {
                            nodeId: node.id,
                            reason: result.error || result.message || 'API Quota Saturated'
                        });
                        this.eventStream.emitEvent(this.graphId, 'TASK_PAUSED', {
                            nodeId: node.id,
                            reason: 'QUOTA_WAITING'
                        });
                    }

                    this.emit('NODE_WAITING_QUOTA', {
                        nodeId: node.id,
                        reason: result.error || result.message,
                        state: this.state
                    });
                    return null;
                }

                // Coi success: false là thất bại trước mọi bước nghiệm thu (Lỗi 1 Fix)
                if (!result || result.success === false) {
                    const errMsg = (result && (result.error || result.message))
                        ? (result.error || result.message)
                        : `Node [${node.id}] action returned failure (success: false)`;
                    throw new Error(errMsg);
                }

                // Acceptance criteria evaluation if verifier is attached
                let verified = true;
                let evidence = null;
                if (this.verifier && node.acceptanceCriteria && node.acceptanceCriteria.length > 0) {
                    if (typeof this.verifier.verifyNodeOutput === 'function') {
                        const audit = await this.verifier.verifyNodeOutput(node, result, this.state);
                        verified = audit.passed;
                        evidence = audit.evidence;
                    }
                }

                if (!verified) {
                    throw new Error(`Node [${node.id}] output failed acceptance criteria.`);
                }

                // Check conditional loops: should we loop back?
                const loop = this.conditionalLoops.find(l => l.from === node.id);
                if (loop) {
                    let shouldLoop = false;
                    try {
                        shouldLoop = Boolean(loop.condition(result, this.state));
                    } catch (e) {}

                    if (shouldLoop) {
                        if (loop.currentLoops >= loop.maxLoops) {
                            this.executionLog.push(`Loop guard reached: Node [${node.id}] exceeded max allowed loops (${loop.maxLoops})`);
                            this.emit('LOOP_GUARD_REACHED', { nodeId: node.id, maxLoops: loop.maxLoops });
                        } else {
                            loop.currentLoops++;
                            node.loopIteration++;
                            this.executionLog.push(`[${node.id}] conditional loop triggered (${loop.currentLoops}/${loop.maxLoops}) -> ${loop.to}`);
                            this.emit('NODE_CONDITIONAL_LOOP', {
                                from: node.id,
                                to: loop.to,
                                iteration: loop.currentLoops,
                                maxLoops: loop.maxLoops
                            });

                            // Đặt lại cả targetNode và node hiện tại về PENDING để vòng lặp chạy lại sạch sẽ, không bị kẹt status 'RUNNING' (Fix Lỗi E)
                            node.status = 'PENDING';
                            node.executedSuccessfully = false;
                            this.completedNodes.delete(node.id);

                            const targetNode = this.nodes.get(loop.to);
                            if (targetNode) {
                                targetNode.status = 'PENDING';
                                targetNode.executedSuccessfully = false;
                                this.completedNodes.delete(loop.to);
                            }
                            return;
                        }
                    }
                }

                // Successful execution
                node.status = 'COMPLETED';
                node.output = result;
                node.evidence = evidence;
                node.executedSuccessfully = true;
                this.completedNodes.add(node.id);
                this.failedNodes.delete(node.id);
                this.executionLog.push(`[${node.id}] COMPLETED`);

                // Update shared graph state
                this.state[node.id] = result;
                if (result && typeof result === 'object') {
                    Object.assign(this.state, result.stateDelta || {});
                }

                this.executionHistory.push({
                    nodeId: node.id,
                    status: 'COMPLETED',
                    timestamp: new Date().toISOString()
                });

                this.emit('NODE_COMPLETED', { nodeId: node.id, output: result });
                return result;

            } catch (err) {
                lastError = err;
                if (!abortController.signal.aborted && err.message?.includes('timed out')) {
                    abortController.abort(err);
                }
                this.emit('NODE_ATTEMPT_FAILED', {
                    nodeId: node.id,
                    attempt,
                    maxRetries: node.maxRetries,
                    error: err.message
                });

                if (attempt <= node.maxRetries) {
                    const delay = node.backoffMs * Math.pow(2, attempt - 1);
                    await new Promise(r => setTimeout(r, delay));
                }
            } finally {
                if (timeoutTimer) clearTimeout(timeoutTimer);
            }
        }

        // Failed after all retries
        node.status = 'FAILED';
        node.output = { error: lastError.message };
        this.failedNodes.add(node.id);
        this.completedNodes.delete(node.id);

        this.executionHistory.push({
            nodeId: node.id,
            status: 'FAILED',
            error: lastError.message,
            timestamp: new Date().toISOString()
        });

        this.emit('NODE_FAILED', { nodeId: node.id, error: lastError.message });
        return { error: lastError.message };
    }

    /**
     * Dynamic Replanning: Replace or splice recovery nodes into the graph
     */
    replan(failedNodeIdOrNodes, recoveryNodeConfig = null) {
        if (Array.isArray(failedNodeIdOrNodes)) {
            for (const n of failedNodeIdOrNodes) {
                this.addNode(n);
            }
            this.emit('GRAPH_REPLANNED', { dynamicNodes: failedNodeIdOrNodes.length });
            return true;
        }

        const failedNodeId = failedNodeIdOrNodes;
        if (!this.nodes.has(failedNodeId)) return false;

        const failedNode = this.nodes.get(failedNodeId);
        const recoveryNode = this.addNode({
            ...recoveryNodeConfig,
            id: recoveryNodeConfig.id || `recovery_${failedNodeId}_${Date.now().toString().slice(-4)}`,
            dependencies: [...failedNode.dependencies],
            isRecovery: true,
            recoveredNodeId: failedNodeId
        });

        // Redirect downstream nodes that depended on failedNodeId to depend on recoveryNode.id
        for (const [id, node] of this.nodes.entries()) {
            if (node.id === recoveryNode.id) continue;
            if (node.dependencies.includes(failedNodeId)) {
                node.dependencies = node.dependencies.map(d => d === failedNodeId ? recoveryNode.id : d);
            }
        }

        this.emit('GRAPH_REPLANNED', {
            failedNodeId,
            recoveryNodeId: recoveryNode.id
        });

        return recoveryNode;
    }

    /**
     * Human-In-The-Loop Approval: approve, reject, or request revision
     */
    submitHumanDecision(nodeId, decision, feedback = '') {
        if (!this.nodes.has(nodeId)) {
            throw new Error(`StateGraph: Node '${nodeId}' not found.`);
        }

        const node = this.nodes.get(nodeId);
        if (node.status !== 'WAITING_APPROVAL') {
            throw new Error(`StateGraph: Node '${nodeId}' is not waiting for approval (Current status: ${node.status}).`);
        }

        // Sync with attached AgentEventStream if available
        if (this.eventStream && typeof this.eventStream.submitDecision === 'function') {
            try {
                this.eventStream.submitDecision(this.graphId, decision, feedback);
            } catch (e) {
                // Non-blocking if already submitted
            }
        }

        if (decision === 'APPROVE') {
            node.status = 'APPROVED';
            node.requiresApproval = false;
            if (node.type === 'human_approval') {
                node.executedSuccessfully = true;
                this.completedNodes.add(node.id);
            } else {
                // Action node (task, tool, etc.): ready to execute upon resume
                node.status = 'PENDING';
                node.executedSuccessfully = false;
                this.completedNodes.delete(node.id);
            }
            this.status = 'RUNNING';
            this.emit('NODE_APPROVED', { nodeId, feedback });
            return { status: 'APPROVED', nodeId };
        } else if (decision === 'REVISE') {
            node.status = 'PENDING';
            node.input.revisionFeedback = feedback;
            this.status = 'RUNNING';
            this.emit('NODE_REVISION_REQUESTED', { nodeId, feedback });
            return { status: 'REVISION_REQUESTED', nodeId };
        } else {
            // REJECT
            node.status = 'FAILED';
            node.output = { error: `Rejected by human supervisor: ${feedback || 'No feedback'}` };
            this.failedNodes.add(node.id);
            this.status = 'FAILED';
            this.emit('NODE_REJECTED', { nodeId, feedback });
            return { status: 'REJECTED', nodeId };
        }
    }

    /**
     * Resume a paused or waiting StateGraph
     */
    async resume(executorFn = null, context = {}) {
        if (this.status === 'WAITING_APPROVAL' || this.status === 'PAUSED' || this.status === 'WAITING_QUOTA') {
            this.status = 'RUNNING';
        }
        for (const node of this.nodes.values()) {
            if (node.status === 'WAITING_QUOTA') {
                node.status = 'PENDING';
            }
        }
        return await this.run(executorFn, context);
    }

    serialize() {
        return {
            graphId: this.graphId,
            status: this.status,
            state: this.state,
            completedNodes: Array.from(this.completedNodes),
            failedNodes: Array.from(this.failedNodes),
            stepCounter: this.stepCounter,
            nodes: Array.from(this.nodes.values()).map(n => n.toJSON()),
            edges: this.edges.map(e => ({ from: e.from, to: e.to })),
            conditionalLoops: this.conditionalLoops.map(l => ({
                from: l.from,
                to: l.to,
                maxLoops: l.maxLoops,
                currentLoops: l.currentLoops
            })),
            executionLog: [...this.executionLog],
            executionHistory: this.executionHistory
        };
    }

    static deserialize(data, config = {}) {
        const graph = new StateGraph({
            graphId: data.graphId,
            initialState: data.state,
            ...config
        });

        graph.status = data.status || 'IDLE';
        graph.stepCounter = data.stepCounter || 0;
        graph.completedNodes = new Set(data.completedNodes || []);
        graph.failedNodes = new Set(data.failedNodes || []);
        graph.executionHistory = data.executionHistory || [];
        if (Array.isArray(data.executionLog)) {
            graph.executionLog = [...data.executionLog];
        }

        // Restore nodes with exact persisted state (Fix Lỗi C)
        if (Array.isArray(data.nodes)) {
            for (const nData of data.nodes) {
                const node = new StateNode(nData);
                node.retryCount = typeof nData.retryCount === 'number' ? nData.retryCount : node.retryCount;
                node.loopIteration = typeof nData.loopIteration === 'number' ? nData.loopIteration : node.loopIteration;
                node.tokensUsed = typeof nData.tokensUsed === 'number' ? nData.tokensUsed : node.tokensUsed;
                node.executedSuccessfully = Boolean(nData.executedSuccessfully);
                if (config.nodeActions && typeof config.nodeActions[node.id] === 'function') {
                    node.action = config.nodeActions[node.id];
                }
                graph.nodes.set(node.id, node);
            }
        }

        // Restore edges
        if (Array.isArray(data.edges)) {
            for (const e of data.edges) {
                graph.addEdge(e.from, e.to);
            }
        }

        // Restore conditional loops (Fix Lỗi C)
        if (Array.isArray(data.conditionalLoops)) {
            for (const l of data.conditionalLoops) {
                const condKey = `${l.from}->${l.to}`;
                const condFn = (config.loopConditions && config.loopConditions[condKey])
                    || (config.loopConditions && config.loopConditions[l.from])
                    || (() => l.currentLoops < l.maxLoops);
                graph.conditionalLoops.push({
                    from: l.from,
                    to: l.to,
                    maxLoops: l.maxLoops || 3,
                    currentLoops: l.currentLoops || 0,
                    condition: condFn
                });
            }
        }

        return graph;
    }

    /**
     * Alias for run(initialInput)
     */
    async execute(initialInput = {}) {
        return this.run(initialInput);
    }

    /**
     * Alias for serialize()
     */
    toJSON() {
        return this.serialize();
    }

    /**
     * Alias for deserialize(data, config)
     */
    static fromJSON(data, config = {}) {
        return StateGraph.deserialize(data, config);
    }
}

module.exports = { StateGraph, StateNode };
