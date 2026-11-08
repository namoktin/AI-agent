/**
 * CheckpointManager.js - Task Checkpoint & Resumption Engine (LangGraph Architecture)
 * Cyber Agent Pro v3.5 Ultimate
 */

const fs = require('fs');
const path = require('path');

class CheckpointManager {
    constructor(baseDir = process.cwd()) {
        this.baseDir = baseDir;
        this.checkpointDir = path.join(this.baseDir, 'memory', 'checkpoints');

        if (!fs.existsSync(this.checkpointDir)) {
            fs.mkdirSync(this.checkpointDir, { recursive: true });
        }
    }

    getCheckpointPath(taskId) {
        const cleanId = String(taskId).replace(/[^a-zA-Z0-9_\-]/g, '_');
        return path.join(this.checkpointDir, `cp_${cleanId}.json`);
    }

    /**
     * Save state at a milestone stage
     */
    saveCheckpoint(taskId, stageName, stateData) {
        try {
            const filePath = this.getCheckpointPath(taskId);
            let checkpoint = {
                taskId,
                createdAt: new Date().toISOString(),
                completedStages: [],
                stageData: {},
                lastStage: stageName
            };

            if (fs.existsSync(filePath)) {
                try {
                    checkpoint = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                } catch (e) {}
            }

            if (!checkpoint.completedStages.includes(stageName)) {
                checkpoint.completedStages.push(stageName);
            }

            checkpoint.lastStage = stageName;
            checkpoint.updatedAt = new Date().toISOString();
            checkpoint.stageData[stageName] = stateData;

            // Update 19 Crash-Resilient Dual-Buffer Checkpoint Writing
            const bakPath = `${filePath}.bak`;
            const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const payload = JSON.stringify(checkpoint, null, 2);

            // Step 1: Write and verify temp file integrity
            fs.writeFileSync(tempPath, payload, 'utf8');
            const verifyParsed = JSON.parse(fs.readFileSync(tempPath, 'utf8'));
            if (!verifyParsed || !verifyParsed.taskId) {
                throw new Error('Integrity verification failed for temporary checkpoint write');
            }

            // Step 2: Backup existing checkpoint if valid
            if (fs.existsSync(filePath)) {
                try {
                    fs.copyFileSync(filePath, bakPath);
                } catch (_) {}
            }

            // Step 3: Atomic rename with Windows retry loop
            let renamed = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    fs.renameSync(tempPath, filePath);
                    renamed = true;
                    break;
                } catch (renameErr) {
                    if (attempt < 3) {
                        const waitMs = attempt * 30;
                        const start = Date.now();
                        while (Date.now() - start < waitMs) { /* sync backoff */ }
                    }
                }
            }

            if (!renamed && fs.existsSync(tempPath)) {
                // Windows extreme fallback if lock persists
                fs.copyFileSync(tempPath, filePath);
                try { fs.unlinkSync(tempPath); } catch (_) {}
            }

            console.log(`📌 [CheckpointManager] Checkpoint atomically saved with backup: Task [${taskId}] at stage [${stageName}]`);
            return true;
        } catch (e) {
            console.warn('[CheckpointManager] Failed to save checkpoint:', e.message);
            return false;
        }
    }

    /**
     * Load existing checkpoint if available with automatic backup recovery
     */
    loadCheckpoint(taskId) {
        const filePath = this.getCheckpointPath(taskId);
        const bakPath = `${filePath}.bak`;

        // 1. Try loading primary checkpoint
        if (fs.existsSync(filePath)) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(content);
            } catch (parseErr) {
                console.warn(`⚠️ [CheckpointManager] Primary checkpoint for [${taskId}] corrupted (${parseErr.message}). Attempting recovery from .bak...`);
            }
        }

        // 2. Try loading backup checkpoint
        if (fs.existsSync(bakPath)) {
            try {
                const bakContent = fs.readFileSync(bakPath, 'utf8');
                const recovered = JSON.parse(bakContent);
                console.log(`✅ [CheckpointManager] Successfully recovered checkpoint for [${taskId}] from backup .bak file`);
                return recovered;
            } catch (bakErr) {
                console.warn(`[CheckpointManager] Backup recovery also failed for [${taskId}]:`, bakErr.message);
            }
        }

        return null;
    }

    /**
     * Delete checkpoint on successful task completion
     */
    clearCheckpoint(taskId) {
        try {
            const filePath = this.getCheckpointPath(taskId);
            const bakPath = `${filePath}.bak`;
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            if (fs.existsSync(bakPath)) {
                try { fs.unlinkSync(bakPath); } catch (_) {}
            }
            console.log(`🧹 [CheckpointManager] Checkpoint and backup cleared for completed task: [${taskId}]`);
        } catch (e) {}
    }
}

module.exports = { CheckpointManager };

