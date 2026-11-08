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

            // Update 18 Tier 4 Atomic Checkpoint Write
            const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            try {
                fs.writeFileSync(tempPath, JSON.stringify(checkpoint, null, 2), 'utf8');
                fs.renameSync(tempPath, filePath);
            } catch (renameErr) {
                // Windows fallback if renameSync collides or locks
                if (fs.existsSync(tempPath)) {
                    fs.copyFileSync(tempPath, filePath);
                    try { fs.unlinkSync(tempPath); } catch (_) {}
                }
            }
            console.log(`📌 [CheckpointManager] Checkpoint atomically saved: Task [${taskId}] at stage [${stageName}]`);
            return true;
        } catch (e) {
            console.warn('[CheckpointManager] Failed to save checkpoint:', e.message);
            return false;
        }
    }

    /**
     * Load existing checkpoint if available
     */
    loadCheckpoint(taskId) {
        try {
            const filePath = this.getCheckpointPath(taskId);
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
        } catch (e) {
            console.warn('[CheckpointManager] Failed to load checkpoint:', e.message);
        }
        return null;
    }

    /**
     * Delete checkpoint on successful task completion
     */
    clearCheckpoint(taskId) {
        try {
            const filePath = this.getCheckpointPath(taskId);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`🧹 [CheckpointManager] Checkpoint cleared for completed task: [${taskId}]`);
            }
        } catch (e) {}
    }
}

module.exports = { CheckpointManager };

