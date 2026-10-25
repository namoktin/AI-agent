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
        this.optimalStrategiesFile = path.join(this.skillsDir, 'optimal_strategies.json');

        if (!fs.existsSync(this.skillsDir)) {
            fs.mkdirSync(this.skillsDir, { recursive: true });
        }
        this._ensureOptimalStrategiesFile();
    }

    _ensureOptimalStrategiesFile() {
        if (!fs.existsSync(this.optimalStrategiesFile)) {
            const seed = {
                "facebook_reels": {
                    "pattern": "facebook.com",
                    "keywords": ["facebook", "fb", "reel", "xemlacuon"],
                    "bestRoute": "Sử dụng BROWSE_WEB kèm extractReels: true hoặc SCRAPE_SOCIAL_MEDIA để trích xuất cả caption, view count, author và canonical reel url. Nếu tải batch, tạo script Node.js / Python tải tuần tự thay vì gọi lệnh thô.",
                    "tokensSaved": 2400
                },
                "tiktok_video": {
                    "pattern": "tiktok.com",
                    "keywords": ["tiktok", "video tiktok", "tik tok"],
                    "bestRoute": "Dùng SCRAPE_SOCIAL_MEDIA hoặc BROWSE_WEB trích xuất trực tiếp selector [data-e2e='browse-video-desc'], like-count và comment-count qua UniversalSocialScraper.",
                    "tokensSaved": 1800
                },
                "youtube_shorts": {
                    "pattern": "youtube.com",
                    "keywords": ["youtube", "shorts", "yt", "youtu.be"],
                    "bestRoute": "Dùng SCRAPE_SOCIAL_MEDIA bóc tách JSON-LD Schema.org VideoObject và thẻ ytd-watch-metadata để lấy chuẩn xác 100% view, like, author.",
                    "tokensSaved": 1900
                },
                "batch_daemon": {
                    "pattern": "tiến trình ngầm",
                    "keywords": ["tiến trình ngầm", "chạy ngầm", "daemon", "tải ngầm"],
                    "bestRoute": "BẮT BUỘC viết file script Node.js hoặc Python vào thư mục chỉ định, sau đó gọi MANAGE_DAEMON action='start' với command='node <script>.js'. KHÔNG gọi yt-dlp trực tiếp vào MANAGE_DAEMON.",
                    "tokensSaved": 2500
                }
            };
            try {
                fs.writeFileSync(this.optimalStrategiesFile, JSON.stringify(seed, null, 2), 'utf8');
            } catch (e) {}
        }
    }

    /**
     * Save an optimal strategy once a workflow succeeds (One-shot Learning)
     */
    saveOptimalStrategy(key, strategyData) {
        try {
            let strategies = {};
            if (fs.existsSync(this.optimalStrategiesFile)) {
                strategies = JSON.parse(fs.readFileSync(this.optimalStrategiesFile, 'utf8'));
            }
            strategies[key] = {
                ...strategyData,
                updatedAt: new Date().toISOString()
            };
            fs.writeFileSync(this.optimalStrategiesFile, JSON.stringify(strategies, null, 2), 'utf8');
            console.log(`💡 [SkillLibrary] Optimal Strategy saved for [${key}] (One-Shot Learning active)`);
            return true;
        } catch (e) {
            console.error(`[SkillLibrary] Failed to save optimal strategy: ${e.message}`);
            return false;
        }
    }

    /**
     * Retrieve optimal strategy to skip trial-and-error and minimize token consumption
     */
    getOptimalStrategy(promptOrQuery) {
        if (!promptOrQuery || typeof promptOrQuery !== 'string') return null;
        try {
            if (!fs.existsSync(this.optimalStrategiesFile)) return null;
            const strategies = JSON.parse(fs.readFileSync(this.optimalStrategiesFile, 'utf8'));
            const lower = promptOrQuery.toLowerCase();

            for (const [key, strat] of Object.entries(strategies)) {
                if (strat.pattern && lower.includes(strat.pattern.toLowerCase())) {
                    return { key, ...strat };
                }
                if (Array.isArray(strat.keywords)) {
                    for (const kw of strat.keywords) {
                        if (lower.includes(kw.toLowerCase())) {
                            return { key, ...strat };
                        }
                    }
                }
            }
            return null;
        } catch (e) {
            return null;
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

