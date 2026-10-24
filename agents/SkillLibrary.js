/**
 * SkillLibrary.js - Procedural Skills Repository (Hermes Agent Architecture)
 * Cyber Agent Pro v3.5 Ultimate
 */

const fs = require('fs');
const path = require('path');

class SkillLibrary {
    constructor(baseDir = process.cwd()) {
        this.baseDir = baseDir;
        this.skillsDir = path.join(this.baseDir, 'memory', 'skills');

        if (!fs.existsSync(this.skillsDir)) {
            fs.mkdirSync(this.skillsDir, { recursive: true });
        }
    }

    /**
     * Find matching procedural skill for a given task prompt
     */
    findMatchingSkill(taskPrompt) {
        if (!taskPrompt || typeof taskPrompt !== 'string') return null;

        const skills = this.listSkills();
        const normalizedPrompt = taskPrompt.toLowerCase();

        let bestMatch = null;
        let highestScore = 0;

        for (const skill of skills) {
            let matches = 0;
            const patterns = skill.triggerPatterns || [];
            if (patterns.length === 0) continue;

            for (const pattern of patterns) {
                if (normalizedPrompt.includes(pattern.toLowerCase())) {
                    matches++;
                }
            }

            const score = matches / patterns.length;
            if (score > highestScore && score >= 0.6) {
                highestScore = score;
                bestMatch = { ...skill, matchScore: score };
            }
        }

        return bestMatch;
    }

    /**
     * Save verified procedural skill (strictly verified outcomes only)
     */
    saveProceduralSkill(skill) {
        if (!skill || !skill.name || !skill.actionGraph) {
            return false;
        }

        // Rule: Only promote verified experiences to official skills
        if (!skill.verified) {
            console.warn('[SkillLibrary] Cannot save unverified skill');
            return false;
        }

        const skillId = skill.id || `skill_${Date.now()}`;
        const filePath = path.join(this.skillsDir, `${skillId}.json`);

        const skillData = {
            id: skillId,
            name: skill.name,
            description: skill.description || '',
            triggerPatterns: skill.triggerPatterns || [],
            actionGraph: skill.actionGraph,
            verified: true,
            acceptanceCriteria: skill.acceptanceCriteria || ['100% independent verification checks passed'],
            executionCount: (skill.executionCount || 0) + 1,
            successCount: (skill.successCount || 0) + (skill.verified ? 1 : 0),
            failureCount: skill.failureCount || 0,
            successRate: skill.successRate !== undefined ? skill.successRate : 1.0,
            updatedAt: new Date().toISOString()
        };

        fs.writeFileSync(filePath, JSON.stringify(skillData, null, 2), 'utf8');
        console.log(`💾 [SkillLibrary] Procedural skill saved: [${skillData.name}]`);
        return true;
    }

    /**
     * Record execution outcome for an existing procedural skill
     */
    recordExecution(skillId, isSuccess = true) {
        try {
            const filePath = path.join(this.skillsDir, `${skillId}.json`);
            if (!fs.existsSync(filePath)) return false;

            const skillData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            skillData.executionCount = (skillData.executionCount || 0) + 1;
            if (isSuccess) {
                skillData.successCount = (skillData.successCount || 0) + 1;
            } else {
                skillData.failureCount = (skillData.failureCount || 0) + 1;
            }
            skillData.successRate = Math.round(((skillData.successCount || 0) / skillData.executionCount) * 100) / 100;
            skillData.updatedAt = new Date().toISOString();

            fs.writeFileSync(filePath, JSON.stringify(skillData, null, 2), 'utf8');
            console.log(`📊 [SkillLibrary] Updated skill stats for [${skillData.name}]: Runs=${skillData.executionCount}, SuccessRate=${Math.round(skillData.successRate * 100)}%`);
            return true;
        } catch (e) {
            console.error(`[SkillLibrary] Failed to record execution: ${e.message}`);
            return false;
        }
    }

    /**
     * List all available skills
     */
    listSkills() {
        try {
            if (!fs.existsSync(this.skillsDir)) return [];
            const files = fs.readdirSync(this.skillsDir).filter(f => f.endsWith('.json'));
            return files.map(f => {
                try {
                    return JSON.parse(fs.readFileSync(path.join(this.skillsDir, f), 'utf8'));
                } catch (e) {
                    return null;
                }
            }).filter(Boolean);
        } catch (e) {
            return [];
        }
    }
}

module.exports = { SkillLibrary };

