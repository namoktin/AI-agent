/**
 * AgentEventStream.js - Real-time SSE Agent Event Streaming & Human-In-The-Loop (HITL) Coordinator
 * Supports:
 * - 13 Standard Event Types (TASK_CREATED, PLAN_GENERATED, AGENT_STARTED, AGENT_OUTPUT_DELTA, etc.)
 * - Bounded In-Memory Event History with Replay on Reconnect
 * - Server-Sent Events (SSE) Client Subscription Management
 * - Persistent Human-In-The-Loop (HITL) State Machine (WAITING_APPROVAL, APPROVE, REVISE, REJECT)
 * 
 * Cyber Agent Pro v5.0 Enterprise
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const EVENT_MAP = {
    TASK_CREATED: 'TASK_CREATED',
    TASK_STARTED: 'TASK_STARTED',
    PLAN_GENERATED: 'PLAN_GENERATED',
    STAGE_CHANGED: 'STAGE_CHANGED',
    AGENT_STARTED: 'AGENT_STARTED',
    NODE_STARTED: 'NODE_STARTED',
    AGENT_OUTPUT_DELTA: 'AGENT_OUTPUT_DELTA',
    TOOL_STARTED: 'TOOL_STARTED',
    TOOL_COMPLETED: 'TOOL_COMPLETED',
    VERIFICATION_STARTED: 'VERIFICATION_STARTED',
    VERIFICATION_FAILED: 'VERIFICATION_FAILED',
    TASK_PAUSED: 'TASK_PAUSED',
    TASK_RESUMED: 'TASK_RESUMED',
    TASK_COMPLETED: 'TASK_COMPLETED',
    TASK_FAILED: 'TASK_FAILED',
    QUOTA_WAITING: 'QUOTA_WAITING',
    TASK_WAITING_APPROVAL: 'TASK_WAITING_APPROVAL'
};

const EVENT_TYPES = Object.keys(EVENT_MAP);

class AgentEventStream extends EventEmitter {
    static get EVENTS() {
        return EVENT_MAP;
    }

    constructor(options = {}) {
        super();
        this.taskEvents = new Map(); // taskId -> Array of events (bounded)
        this.taskClients = new Map(); // taskId -> Set of Express Response objects (SSE)
        this.globalClients = new Set(); // Set of Express Response objects
        this.maxEventsPerTask = options.maxEventsPerTask || 200;
        this.eventCounter = 0;

        // HITL Pending Approvals
        this.pendingApprovals = new Map(); // taskId -> { taskId, nodeId, description, input, risks, createdAt, status }
        this.approvalsFile = path.resolve(process.cwd(), 'memory', 'hitl_approvals.json');
        this._loadApprovals();
    }

    emit(event, ...args) {
        if (!this._isEmitting && typeof event === 'string' && (EVENT_MAP[event] || (typeof args[0] === 'object' && args[0]?.taskId))) {
            this._isEmitting = true;
            try {
                const payload = args[0] || {};
                const taskId = payload.taskId || 'default';
                this.emitEvent(taskId, event, payload, payload.agent || 'system');
            } finally {
                this._isEmitting = false;
            }
        }
        return super.emit(event, ...args);
    }

    _loadApprovals() {
        try {
            if (fs.existsSync(this.approvalsFile)) {
                const data = JSON.parse(fs.readFileSync(this.approvalsFile, 'utf8'));
                for (const [k, v] of Object.entries(data)) {
                    this.pendingApprovals.set(k, v);
                }
            }
        } catch (e) {}
    }

    _saveApprovals() {
        try {
            const dir = path.dirname(this.approvalsFile);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const obj = Object.fromEntries(this.pendingApprovals);
            fs.writeFileSync(this.approvalsFile, JSON.stringify(obj, null, 2), 'utf8');
        } catch (e) {}
    }

    /**
     * Emit a structured event and broadcast to active SSE subscribers
     */
    emitEvent(taskId, type, data = {}, agent = 'system') {
        const eventId = `evt_${++this.eventCounter}_${Date.now()}`;
        const timestamp = new Date().toISOString();

        // Data sanitization: redact sensitive authorization headers or secret keys
        const sanitizedData = this._sanitize(data);

        const event = {
            eventId,
            taskId,
            timestamp,
            type,
            agent,
            data: sanitizedData
        };

        // Store in bounded task event history
        if (!this.taskEvents.has(taskId)) {
            this.taskEvents.set(taskId, []);
        }
        const history = this.taskEvents.get(taskId);
        history.push(event);
        if (history.length > this.maxEventsPerTask) {
            history.shift();
        }

        // Broadcast to task-specific SSE subscribers
        const subscribers = this.taskClients.get(taskId);
        if (subscribers && subscribers.size > 0) {
            const ssePayload = `id: ${eventId}\nevent: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
            for (const res of subscribers) {
                try {
                    res.write(ssePayload);
                } catch (e) {
                    subscribers.delete(res);
                }
            }
        }

        // Broadcast to global SSE subscribers
        if (this.globalClients.size > 0) {
            const ssePayload = `id: ${eventId}\nevent: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
            for (const res of this.globalClients) {
                try {
                    res.write(ssePayload);
                } catch (e) {
                    this.globalClients.delete(res);
                }
            }
        }

        super.emit(type, event);
        super.emit('*', event);
        return event;
    }

    _sanitize(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        try {
            const str = JSON.stringify(obj, (key, value) => {
                if (/token|api_?key|secret|password|authorization/i.test(key)) {
                    return '[REDACTED]';
                }
                return value;
            });
            return JSON.parse(str);
        } catch (e) {
            return obj;
        }
    }

    /**
     * Subscribe Express response to SSE stream
     */
    subscribe(taskId, res) {
        if (typeof res.setHeader === 'function') {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders?.();
        }

        // Send initial connection comment
        res.write(`: connected to cyber-agent-stream for task ${taskId}\n\n`);

        // Replay historical events for this task
        const history = this.taskEvents.get(taskId) || [];
        for (const ev of history) {
            res.write(`id: ${ev.eventId}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
        }

        // Register client
        if (taskId === 'all' || taskId === 'global') {
            this.globalClients.add(res);
        } else {
            if (!this.taskClients.has(taskId)) {
                this.taskClients.set(taskId, new Set());
            }
            this.taskClients.get(taskId).add(res);
        }

        // Keep-alive ping interval
        const keepAliveTimer = setInterval(() => {
            try {
                res.write(': keepalive\n\n');
            } catch (e) {
                clearInterval(keepAliveTimer);
            }
        }, 15000);

        // Cleanup on client disconnect
        res.on('close', () => {
            clearInterval(keepAliveTimer);
            if (taskId === 'all' || taskId === 'global') {
                this.globalClients.delete(res);
            } else {
                const subs = this.taskClients.get(taskId);
                if (subs) {
                    subs.delete(res);
                    if (subs.size === 0) this.taskClients.delete(taskId);
                }
            }
        });
    }

    /**
     * HUMAN-IN-THE-LOOP (HITL): Request human supervisor approval
     */
    requestApproval(taskId, detailsOrNodeId = {}, description = '', input = {}, risks = []) {
        const details = typeof detailsOrNodeId === 'string'
            ? { nodeId: detailsOrNodeId, description, input, risks }
            : detailsOrNodeId;

        const approval = {
            taskId,
            nodeId: details.nodeId || 'action',
            description: details.description || 'Action requires user authorization',
            actionType: details.actionType || 'WRITE_CRITICAL',
            input: details.input || {},
            risks: details.risks || ['File modification or irreversible external state change'],
            createdAt: new Date().toISOString(),
            status: 'WAITING_APPROVAL'
        };

        this.pendingApprovals.set(taskId, approval);
        this._saveApprovals();

        this.emitEvent(taskId, 'TASK_WAITING_APPROVAL', {
            reason: 'WAITING_APPROVAL',
            approvalDetails: approval
        }, 'system');
        this.emitEvent(taskId, 'TASK_PAUSED', {
            reason: 'WAITING_APPROVAL',
            approvalDetails: approval
        }, 'system');

        return approval;
    }

    _findApproval(taskId) {
        if (!taskId) return null;
        let approval = this.pendingApprovals.get(taskId);
        if (!approval && taskId.startsWith('graph_')) {
            approval = this.pendingApprovals.get(taskId.replace(/^graph_/, ''));
        }
        if (!approval && !taskId.startsWith('graph_')) {
            approval = this.pendingApprovals.get(`graph_${taskId}`);
        }
        return approval || null;
    }

    getApprovalStatus(taskId) {
        return this._findApproval(taskId);
    }

    getAllPendingApprovals() {
        return Array.from(this.pendingApprovals.values()).filter(a => a.status === 'WAITING_APPROVAL');
    }

    getPendingApprovals() {
        return this.getAllPendingApprovals();
    }

    getApprovalDecision(taskId, nodeId) {
        const approval = this._findApproval(taskId);
        if (approval && (!nodeId || approval.nodeId === nodeId)) {
            return approval.status;
        }
        return null;
    }

    /**
     * HUMAN-IN-THE-LOOP: Submit decision (APPROVE | REJECT | REVISE)
     */
    submitDecision(taskId, decision, feedback = '') {
        const approval = this._findApproval(taskId);
        if (!approval) {
            throw new Error(`No pending approval found for task [${taskId}]`);
        }

        const validDecisions = ['APPROVE', 'REJECT', 'REVISE'];
        if (!validDecisions.includes(decision)) {
            throw new Error(`Invalid decision: '${decision}'. Must be one of: ${validDecisions.join(', ')}`);
        }

        approval.success = true;
        approval.status = decision === 'APPROVE' ? 'APPROVED' : (decision === 'REVISE' ? 'REVISION_REQUESTED' : 'REJECTED');
        approval.decision = decision;
        approval.feedback = feedback;
        approval.decidedAt = new Date().toISOString();

        this._saveApprovals();

        if (decision === 'APPROVE') {
            this.emitEvent(taskId, 'TASK_RESUMED', { decision: 'APPROVED', feedback }, 'human_supervisor');
        } else if (decision === 'REVISE') {
            this.emitEvent(taskId, 'TASK_RESUMED', { decision: 'REVISION_REQUESTED', feedback }, 'human_supervisor');
        } else {
            this.emitEvent(taskId, 'TASK_FAILED', { reason: 'REJECTED_BY_HUMAN', feedback }, 'human_supervisor');
        }

        return approval;
    }
}

// Global Singleton for the platform
const globalEventStream = new AgentEventStream();

module.exports = {
    AgentEventStream,
    globalEventStream,
    EVENT_TYPES
};
