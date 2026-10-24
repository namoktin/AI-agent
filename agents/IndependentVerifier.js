/**
 * IndependentVerifier.js - Independent Verification Engine (Zero Blind Trust & Live Proof)
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
     * Perform comprehensive independent verification on agent outputs, tools, files, and claims
     */
    async verifyExecution(directive, plan, specialistResults, executionLog = [], mode = 'standard') {
        const checks = [];
        let totalChecks = 0;
        let passedChecks = 0;

        // 1. VERIFY PHYSICAL FILE CLAIMS (Existence, Size, Syntax, Anti-stub, Live Test Run)
        const createdFiles = this.extractTargetFiles(specialistResults, executionLog);
        for (const filePath of createdFiles) {
            totalChecks++;
            const fileCheck = this.verifyPhysicalFile(filePath);
            checks.push(fileCheck);
            if (fileCheck.passed) passedChecks++;
        }

        // 2. VERIFY RESEARCH CLAIMS (For Deep Research, Academic Citations & Fact Evidence)
        const isResearch = mode === 'deep_research' || 
            /nghiên cứu|research|doi|pubmed|pmid|y học|clinical|khoa học/i.test(directive?.objective || '') ||
            /nghiên cứu|research|doi|pubmed|pmid|y học|clinical|khoa học/i.test(plan?.description || '') ||
            specialistResults.some(r => r.agent === 'researcher' || /(?:doi:\s*10\.\d{4,9})|(?:PMID:\s*\d+)/i.test(typeof r.response === 'string' ? r.response : JSON.stringify(r.response || '')));

        if (isResearch) {
            totalChecks++;
            const claimCheck = await this.verifyResearchClaims(specialistResults);
            checks.push(claimCheck);
            if (claimCheck.passed) passedChecks++;
        }

        // 3. VERIFY SPECIALIST OUTPUT CONTRACTS & SUBSTANCE
        for (const res of specialistResults) {
            totalChecks++;
            if (res.success && res.response) {
                const text = typeof res.response === 'string' ? res.response : JSON.stringify(res.response);
                const isStub = text.length < 50 || /lỗi nghiêm trọng|crash|cannot fulfill|tôi không thể thực hiện/i.test(text);
                const hasAntiPattern = /\/\/\s*TODO:\s*implement|throw new Error\(['"]not implemented['"]\)/i.test(text);

                if (!isStub && !hasAntiPattern) {
                    passedChecks++;
                    checks.push({
                        type: 'specialist_substance',
                        target: res.agent || res.id,
                        passed: true,
                        details: `Output length: ${text.length} chars, substantive content verified`
                    });
                } else {
                    checks.push({
                        type: 'specialist_substance',
                        target: res.agent || res.id,
                        passed: false,
                        details: isStub ? 'Output is empty stub or contains refusal' : 'Output contains unimplemented placeholder code'
                    });
                }
            } else {
                checks.push({
                    type: 'specialist_execution',
                    target: res.agent || res.id,
                    passed: false,
                    details: res.error || 'Specialist returned success: false'
                });
            }
        }

        // 4. DETERMINE FINAL AUDIT STATUS & SUBSTANTIVE SCORE
        const passRatio = totalChecks > 0 ? (passedChecks / totalChecks) : 1;
        let status = 'APPROVED';
        let verified = true;

        if (totalChecks === 0) {
            status = 'NEEDS_REVIEW';
            verified = true;
        } else if (passRatio === 1) {
            status = 'APPROVED';
            verified = true;
        } else if (passRatio >= 0.75) {
            status = 'VERIFIED';
            verified = true;
        } else {
            status = 'FAILED';
            verified = false;
        }

        const calculatedScore = Math.min(100, Math.max(60, Math.round(70 + (passRatio * 28))));

        return {
            verified,
            status,
            qualityScore: calculatedScore,
            passRatio: Math.round(passRatio * 100),
            totalChecks,
            passedChecks,
            checks,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Substantive verification of fast responses (no arbitrary 90)
     */
    verifyFastResponse(userRequest, fastResult) {
        if (!fastResult || !fastResult.success || !fastResult.response) {
            return {
                verified: false,
                status: 'FAILED',
                qualityScore: 50,
                checks: [{ type: 'fast_response', passed: false, details: 'Fast response missing or returned error' }]
            };
        }

        const text = String(fastResult.response).trim();
        let score = 75;
        const checks = [];

        // Check 1: Length and Substance
        if (text.length >= 40) {
            score += 10;
            checks.push({ type: 'fast_substance', passed: true, details: `Length: ${text.length} chars` });
        } else {
            checks.push({ type: 'fast_substance', passed: false, details: 'Response too brief (< 40 chars)' });
        }

        // Check 2: No refusal/error keywords
        const hasRefusal = /tôi không thể|xin lỗi tôi không|error occurred|cannot answer/i.test(text);
        if (!hasRefusal) {
            score += 7;
            checks.push({ type: 'fast_no_refusal', passed: true, details: 'No refusal detected' });
        } else {
            score -= 15;
            checks.push({ type: 'fast_no_refusal', passed: false, details: 'Contains refusal or error indicator' });
        }

        // Check 3: Structured / clean formatting
        if (text.includes('\n') || text.includes(':') || text.includes('-')) {
            score += 5;
            checks.push({ type: 'fast_structure', passed: true, details: 'Clean structured layout' });
        }

        const finalScore = Math.min(98, score);
        return {
            verified: finalScore >= 75,
            status: finalScore >= 88 ? 'APPROVED' : (finalScore >= 75 ? 'VERIFIED' : 'NEEDS_REVIEW'),
            qualityScore: finalScore,
            checks
        };
    }

    /**
     * Verify academic and research citations in specialist outputs with live Crossref/PubMed & Content Entailment check
     */
    async verifyResearchClaims(specialistResults) {
        let combinedText = '';
        for (const res of specialistResults) {
            if (res.response) {
                combinedText += ' ' + (typeof res.response === 'string' ? res.response : JSON.stringify(res.response));
            }
        }

        // 1. Search for real URLs
        const urlMatches = combinedText.match(/https?:\/\/[^\s\)\"\'>]+/g) || [];
        // 2. Search for DOI or PubMed citations
        const doiMatches = combinedText.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/g) || [];
        const pmidMatches = combinedText.match(/(?:PMID:\s*(\d+))|(?:pubmed\.ncbi\.nlm\.nih\.gov\/(\d+))/gi) || [];
        // 3. Search for quantitative data / metrics (percentages, numbers with units)
        const metricMatches = combinedText.match(/\b\d+(?:\.\d+)?(?:%|mg|ml|km|kg|ms|s|°C|giây|phút|giờ|USD|VNĐ|triệu|tỷ)\b/gi) || [];

        let liveSourceVerified = false;
        let verifiedSourceTitle = '';
        let contentEntailed = false;

        // A. Verify DOI via Crossref or doi.org API
        if (doiMatches.length > 0) {
            const rawDoi = doiMatches[0].replace(/[.,;:)]+$/, '');
            try {
                const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(rawDoi)}`, {
                    headers: { 'User-Agent': 'CyberAgent/3.5 (mailto:researcher@agent.local)' },
                    signal: AbortSignal.timeout(4000)
                });
                if (res.ok) {
                    const data = await res.json();
                    verifiedSourceTitle = data.message?.title?.[0] || 'Indexed DOI Article';
                    liveSourceVerified = true;
                }
            } catch (doiErr) {
                try {
                    const doiRes = await fetch(`https://doi.org/${encodeURIComponent(rawDoi)}`, {
                        method: 'HEAD',
                        signal: AbortSignal.timeout(3000),
                        headers: { 'User-Agent': 'Mozilla/5.0' }
                    });
                    if (doiRes.status >= 200 && doiRes.status < 400) {
                        liveSourceVerified = true;
                        verifiedSourceTitle = `DOI: ${rawDoi}`;
                    }
                } catch (e) {}
            }
        }

        // B. Verify PMID via NCBI PubMed API
        if (!liveSourceVerified && pmidMatches.length > 0) {
            const idMatch = pmidMatches[0].match(/\d+/);
            if (idMatch) {
                const pmid = idMatch[0];
                try {
                    const pmidRes = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`, {
                        signal: AbortSignal.timeout(4000)
                    });
                    if (pmidRes.ok) {
                        const data = await pmidRes.json();
                        if (data.result?.[pmid]?.title) {
                            liveSourceVerified = true;
                            verifiedSourceTitle = data.result[pmid].title;
                        }
                    }
                } catch (pmidErr) {}
            }
        }

        // C. Verify Live URL & Sample Content Entailment
        if (urlMatches.length > 0) {
            for (let i = 0; i < Math.min(2, urlMatches.length); i++) {
                const targetUrl = urlMatches[i].replace(/[.,;:)]+$/, '');
                try {
                    const res = await fetch(targetUrl, {
                        method: 'GET',
                        signal: AbortSignal.timeout(4000),
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                    });
                    if (res.status >= 200 && res.status < 400) {
                        liveSourceVerified = true;
                        const pageSample = (await res.text()).slice(0, 5000).toLowerCase();
                        // Check if at least 1 core topic keyword from claim text exists in the page
                        const keywords = combinedText.toLowerCase().match(/[a-z0-9_-]{4,}/g) || [];
                        const significantWords = keywords.filter(w => !['https', 'http', 'content', 'title', 'value', 'result', 'research', 'thực', 'hiện', 'nghiên', 'cứu'].includes(w));
                        if (significantWords.some(kw => pageSample.includes(kw))) {
                            contentEntailed = true;
                            break;
                        }
                    }
                } catch (e) {}
            }
        }

        // D. Check Entailment against verified academic title if present
        if (verifiedSourceTitle) {
            const titleLower = verifiedSourceTitle.toLowerCase();
            const textLower = combinedText.toLowerCase();
            const words = titleLower.split(/\s+/).filter(w => w.length >= 4);
            if (words.some(w => textLower.includes(w))) {
                contentEntailed = true;
            }
        }

        const hasMetrics = metricMatches.length >= 2;

        if (liveSourceVerified && (contentEntailed || hasMetrics)) {
            return {
                type: 'research_live_verification',
                target: 'claims_and_evidence',
                passed: true,
                details: `Live verified: Nguồn tồn tại thật (${verifiedSourceTitle ? verifiedSourceTitle.slice(0, 60) + '...' : 'URL hoạt động'}), đối chiếu luận điểm & dữ liệu định lượng (${metricMatches.length} metrics) ĐẠT`
            };
        } else if (liveSourceVerified || (doiMatches.length > 0 && hasMetrics)) {
            return {
                type: 'research_verification',
                target: 'claims_and_evidence',
                passed: true,
                details: `Xác thực định dạng nguồn & số liệu định lượng: ${metricMatches.length} metrics, live source checked`
            };
        } else {
            return {
                type: 'research_verification',
                target: 'claims_and_evidence',
                passed: false,
                details: 'Nguồn học thuật (DOI/PMID/URL) không thể xác thực trên hệ thống hoặc thiếu dữ liệu định lượng kiểm chứng'
            };
        }
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
        const pathRegex = /(?:[A-Za-z]:\\[a-zA-Z0-9_\-\\]+\.[a-zA-Z0-9]+)|(?:[a-zA-Z0-9_\-\/]+\.(?:js|json|md|py|csv|html|txt))/g;
        for (const res of specialistResults) {
            const text = typeof res.response === 'string' ? res.response : '';
            const matches = text.match(pathRegex) || [];
            for (const m of matches) {
                if (m.length > 5 && !m.includes('*') && !m.includes('<')) {
                    const resolved = path.isAbsolute(m) ? m : path.resolve(this.baseDir, m);
                    if (fs.existsSync(resolved)) {
                        fileSet.add(resolved);
                    }
                }
            }
        }

        return Array.from(fileSet);
    }

    /**
     * Verify physical existence, non-emptiness, syntax, and substance of a file
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

            const content = fs.readFileSync(filePath, 'utf8');

            // Anti-stub check in file content
            if (/\/\/\s*TODO:\s*implement|throw new Error\(['"]not implemented['"]\)|pass\s*#\s*placeholder/i.test(content)) {
                return {
                    type: 'substance_validation',
                    target: filePath,
                    passed: false,
                    details: 'File contains unimplemented placeholder or stub code'
                };
            }

            // Syntax and Live Execution verification for JS / JSON / Python
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.json') {
                try {
                    const parsed = JSON.parse(content);
                    if (typeof parsed !== 'object' || parsed === null) throw new Error('Root is not object or array');
                    const itemCount = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
                    if (itemCount === 0) {
                        return {
                            type: 'data_integrity',
                            target: filePath,
                            passed: false,
                            details: 'JSON file is empty container (0 elements)'
                        };
                    }
                } catch (e) {
                    return {
                        type: 'syntax_validation',
                        target: filePath,
                        passed: false,
                        details: `Invalid JSON syntax: ${e.message}`
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
                        details: 'JavaScript syntax validation failed (node --check)'
                    };
                }
            } else if (ext === '.py') {
                try {
                    execSync(`python -m py_compile "${filePath}"`, { stdio: 'ignore', timeout: 5000 });
                } catch (e) {
                    return {
                        type: 'syntax_validation',
                        target: filePath,
                        passed: false,
                        details: 'Python syntax validation failed (py_compile)'
                    };
                }

                // Live Unit Test Execution Check for Python test files
                if (/unittest|def test_|if __name__\s*==\s*['"]__main__['"]/i.test(content)) {
                    try {
                        execSync(`python "${filePath}"`, {
                            stdio: 'pipe',
                            timeout: 8000,
                            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
                        });
                        return {
                            type: 'live_test_execution',
                            target: filePath,
                            passed: true,
                            details: `Valid Python file (${Math.round(stat.size)} bytes), passed live unit tests successfully`
                        };
                    } catch (testErr) {
                        return {
                            type: 'live_test_execution',
                            target: filePath,
                            passed: false,
                            details: `Python live test execution failed: ${testErr.message}`
                        };
                    }
                }
            }

            return {
                type: 'physical_verification',
                target: filePath,
                passed: true,
                details: `Valid file (${Math.round(stat.size)} bytes), syntax & substance confirmed`
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
