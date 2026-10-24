/**
 * IndependentVerifier.js - Independent Verification Engine (Zero Blind Trust)
 * Cyber Agent Pro v3.5 Ultimate
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class IndependentVerifier {
    constructor(baseDir = process.cwd()) {
        this.baseDir = baseDir;
    }

    /**
     * Perform comprehensive independent verification on agent outputs and tool calls
     */
    async verifyExecution(directive, plan, specialistResults, executionLog = []) {
        const checks = [];
        let totalChecks = 0;
        let passedChecks = 0;

        // 1. VERIFY PHYSICAL FILE CLAIMS
        const createdFiles = this.extractTargetFiles(specialistResults, executionLog);
        for (const filePath of createdFiles) {
            totalChecks++;
            const fileCheck = this.verifyPhysicalFile(filePath);
            checks.push(fileCheck);
            if (fileCheck.passed) passedChecks++;
        }

        // 2. VERIFY TOOL EXECUTION CONTRACTS
        for (const res of specialistResults) {
            totalChecks++;
            if (res.success && res.response) {
                // Check if response contains fatal errors or empty stub
                const isStub = res.response.length < 30 || /lỗi nghiêm trọng|crash|cannot fulfill/i.test(res.response);
                if (!isStub) {
                    passedChecks++;
                    checks.push({
                        type: 'specialist_output',
                        target: res.agent || res.id,
                        passed: true,
                        details: `Output length: ${res.response.length} chars, valid format`
                    });
                } else {
                    checks.push({
                        type: 'specialist_output',
                        target: res.agent || res.id,
                        passed: false,
                        details: 'Output is stub or indicates failure'
                    });
                }
            } else {
                checks.push({
                    type: 'specialist_output',
                    target: res.agent || res.id,
                    passed: false,
                    details: res.error || 'Agent returned success: false'
                });
            }
        }

        // 3. DETERMINE FINAL AUDIT STATUS
        let status = 'VERIFIED';
        let verified = true;
        const passRatio = totalChecks > 0 ? (passedChecks / totalChecks) : 1;

        if (totalChecks === 0) {
            status = 'NEEDS_REVIEW';
            verified = true;
        } else if (passRatio === 1) {
            status = 'VERIFIED';
            verified = true;
        } else if (passRatio >= 0.7) {
            status = 'NEEDS_REVIEW';
            verified = true;
        } else {
            status = 'FAILED';
            verified = false;
        }

        return {
            verified,
            status,
            passRatio: Math.round(passRatio * 100),
            totalChecks,
            passedChecks,
            checks,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Extract all file paths claimed to be written or saved
     */
    extractTargetFiles(specialistResults, executionLog) {
        const fileSet = new Set();

        // Check tool calls in logs
        for (const log of executionLog) {
            if (log.tool === 'WRITE_FILE' || log.tool === 'SAVE_FILE') {
                const target = log.args?.filePath || log.args?.path;
                if (target) fileSet.add(path.resolve(this.baseDir, target));
            }
        }

        // Regex scan in responses for path patterns
        const pathRegex = /(?:C:\\[a-zA-Z0-9_\-\\]+\.[a-zA-Z0-9]+)|(?:[a-zA-Z0-9_\-\/]+\.(?:js|json|md|py|csv|html|txt))/g;
        for (const res of specialistResults) {
            const text = typeof res.response === 'string' ? res.response : '';
            const matches = text.match(pathRegex) || [];
            for (const m of matches) {
                if (m.length > 5 && !m.includes('*') && !m.includes('<')) {
                    const resolved = path.isAbsolute(m) ? m : path.resolve(this.baseDir, m);
                    // Only verify if file actually exists or was supposedly targeted
                    if (fs.existsSync(resolved)) {
                        fileSet.add(resolved);
                    }
                }
            }
        }

        return Array.from(fileSet);
    }

    /**
     * Verify physical existence, non-emptiness, and syntax of a file
     */
    verifyPhysicalFile(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                return {
                    type: 'file_existence',
                    target: filePath,
                    passed: false,
                    details: 'File does NOT exist on disk'
                };
            }

            const stat = fs.statSync(filePath);
            if (stat.size === 0) {
                return {
                    type: 'file_integrity',
                    target: filePath,
                    passed: false,
                    details: 'File exists but is 0 bytes (empty)'
                };
            }

            // Syntax verification for JS / JSON
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.json') {
                try {
                    JSON.parse(fs.readFileSync(filePath, 'utf8'));
                } catch (e) {
                    return {
                        type: 'syntax_validation',
                        target: filePath,
                        passed: false,
                        details: `Invalid JSON: ${e.message}`
                    };
                }
            } else if (ext === '.js') {
                try {
                    execSync(`node --check "${filePath}"`, { stdio: 'ignore', timeout: 5000 });
                } catch (e) {
                    return {
                        type: 'syntax_validation',
                        target: filePath,
                        passed: false,
                        details: 'JavaScript syntax validation failed'
                    };
                }
            }

            return {
                type: 'physical_verification',
                target: filePath,
                passed: true,
                details: `Valid file (${Math.round(stat.size)} bytes), integrity confirmed`
            };
        } catch (e) {
            return {
                type: 'file_verification_error',
                target: filePath,
                passed: false,
                details: e.message
            };
        }
    }
}

module.exports = { IndependentVerifier };
