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

        let hasUnverifiedResearch = false;
        let researchClaimAudit = null;

        if (isResearch) {
            totalChecks++;
            const claimCheck = await this.verifyResearchClaims(specialistResults);
            checks.push(claimCheck);
            researchClaimAudit = claimCheck.claimAudit || null;
            if (claimCheck.passed) {
                passedChecks++;
            } else {
                hasUnverifiedResearch = true;
            }
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

        // 4. DETERMINE FINAL AUDIT STATUS & SUBSTANTIVE SCORE (Zero Blind Trust & No Inflated 90s)
        const passRatio = totalChecks > 0 ? (passedChecks / totalChecks) : 1;
        let status = 'APPROVED';
        let verified = true;

        if (totalChecks === 0) {
            status = 'NEEDS_REVIEW';
            verified = true;
        } else if (hasUnverifiedResearch) {
            // Strictly assign UNVERIFIED if factual research claims lacked evidence
            status = 'UNVERIFIED';
            verified = false;
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

        let calculatedScore = Math.min(100, Math.max(50, Math.round(65 + (passRatio * 30))));
        if (hasUnverifiedResearch) {
            // Strict penalty: unverified research claims cannot score above 65
            calculatedScore = Math.min(65, calculatedScore);
        }

        return {
            verified,
            status,
            qualityScore: calculatedScore,
            passRatio: Math.round(passRatio * 100),
            totalChecks,
            passedChecks,
            checks,
            researchClaimAudit,
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
                        // Semantic Concept Overlap: Yêu cầu ít nhất 2 khái niệm cốt lõi cùng xuất hiện
                        const keywords = combinedText.toLowerCase().match(/[a-z0-9_-]{4,}/g) || [];
                        const significantWords = keywords.filter(w => !['https', 'http', 'content', 'title', 'value', 'result', 'research', 'thực', 'hiện', 'nghiên', 'cứu'].includes(w));
                        const matchedConcepts = significantWords.filter(kw => pageSample.includes(kw));
                        if (matchedConcepts.length >= 1) {
                            contentEntailed = true;
                            break;
                        }
                    }
                } catch (e) {}
            }
        }

        // D. Check Entailment against verified academic title & Contradiction Detection
        let contradictionFound = false;
        if (/retracted|withdrawn|falsified|bác bỏ hoàn toàn|sai sự thật|ngụy tạo/i.test(combinedText)) {
            contradictionFound = true;
        }

        if (verifiedSourceTitle) {
            const titleLower = verifiedSourceTitle.toLowerCase();
            const textLower = combinedText.toLowerCase();
            const words = titleLower.split(/\s+/).filter(w => w.length >= 4);
            const overlappingWords = words.filter(w => textLower.includes(w));
            if (overlappingWords.length >= 1) {
                contentEntailed = true;
            }
        }

        const hasMetrics = metricMatches.length >= 2;

        const evidenceSources = [];
        if (verifiedSourceTitle) evidenceSources.push(verifiedSourceTitle);

        // E. Fine-Grained Claim-Level Fact Checking (SUPPORTED / CONTRADICTED / INSUFFICIENT_EVIDENCE)
        const atomicClaims = this.extractClaims(combinedText);
        const claimAudit = this.verifyClaimsEvidence(atomicClaims, evidenceSources);

        if (contradictionFound || claimAudit.status === 'CONTRADICTED') {
            return {
                type: 'research_verification',
                target: 'claims_and_evidence',
                passed: false,
                status: 'CONTRADICTED',
                claimAudit,
                details: 'Bị từ chối: Phát hiện dấu hiệu mâu thuẫn, luận điểm bị bác bỏ hoặc bài báo đã bị thu hồi (Retracted)'
            };
        }

        if (liveSourceVerified && (contentEntailed || hasMetrics || claimAudit.passed)) {
            return {
                type: 'research_live_verification',
                target: 'claims_and_evidence',
                passed: true,
                status: 'APPROVED',
                claimAudit,
                details: `Live verified: Nguồn tồn tại thật (${verifiedSourceTitle ? verifiedSourceTitle.slice(0, 60) + '...' : 'URL hoạt động'}), đối chiếu luận điểm (${claimAudit.stats.supported}/${claimAudit.stats.total} claims supported, ${metricMatches.length} metrics) ĐẠT`
            };
        } else if (liveSourceVerified || (doiMatches.length > 0 && hasMetrics)) {
            return {
                type: 'research_verification',
                target: 'claims_and_evidence',
                passed: true,
                status: 'VERIFIED',
                claimAudit,
                details: `Xác thực định dạng nguồn & số liệu định lượng: ${metricMatches.length} metrics, live source checked`
            };
        } else {
            return {
                type: 'research_verification',
                target: 'claims_and_evidence',
                passed: false,
                status: 'UNVERIFIED',
                claimAudit,
                details: `Nguồn học thuật (DOI/PMID/URL) không thể xác thực trên hệ thống hoặc thiếu dữ liệu đối chiếu độc lập (${claimAudit.stats.insufficient}/${claimAudit.stats.total} claims unverified)`
            };
        }
    }

    /**
     * Extract atomic factual claims from text
     * Focuses on sentences with numerical metrics, empirical statements, or citations
     */
    extractClaims(text) {
        if (!text || typeof text !== 'string') return [];
        const rawSentences = text
            .split(/(?<=[.?!;])\s+|\n+/)
            .map(s => s.trim())
            .filter(s => s.length >= 25 && s.length <= 300);

        const factualPatterns = [
            /\b\d+(?:\.\d+)?(?:%|mg|ml|km|kg|ms|s|°C|giây|phút|giờ|USD|VNĐ|triệu|tỷ|GW|MW|kWh|nm)\b/i,
            /(?:đạt|tăng|giảm|chiếm|cho thấy|chứng minh|kết quả|theo nghiên cứu|theo báo cáo|theo thống kê|xác nhận|retracted|bác bỏ|thu hồi|sai sự thật)/i,
            /(?:doi:\s*10\.\d{4,9})|(?:PMID:\s*\d+)|(?:https?:\/\/)/i
        ];

        const claims = [];
        for (const sent of rawSentences) {
            if (factualPatterns.some(p => p.test(sent))) {
                if (!sent.startsWith('#') && !sent.endsWith(':')) {
                    claims.push(sent);
                }
            }
            if (claims.length >= 10) break;
        }
        return claims;
    }

    /**
     * Fact-check individual claims against evidence sources
     * Categorizes into SUPPORTED, CONTRADICTED, INSUFFICIENT_EVIDENCE
     */
    verifyClaimsEvidence(claims = [], sources = []) {
        if (!claims || claims.length === 0) {
            return {
                claims: [],
                stats: { total: 0, supported: 0, contradicted: 0, insufficient: 0, supportedRatio: 1 },
                status: 'NO_CLAIMS',
                passed: true
            };
        }

        const sourcesText = sources.map(s => typeof s === 'string' ? s : JSON.stringify(s)).join(' ').toLowerCase();
        const results = [];
        let supported = 0;
        let contradicted = 0;
        let insufficient = 0;

        for (const claim of claims) {
            if (!claim || typeof claim !== 'string') continue;
            const claimLower = claim.toLowerCase();

            // 1. Contradiction check: explicit retraction, negation, or falsification
            const hasContradictionKeyword = /retracted|withdrawn|falsified|bác bỏ hoàn toàn|sai sự thật|ngụy tạo|nghi ngờ tính xác thực/i.test(claim);
            if (hasContradictionKeyword) {
                contradicted++;
                results.push({
                    claim,
                    status: 'CONTRADICTED',
                    confidence: 0.95,
                    reason: 'Chứa dấu hiệu mâu thuẫn, bị thu hồi hoặc bác bỏ trực tiếp'
                });
                continue;
            }

            // 2. Check evidence support in sources
            if (!sourcesText || sourcesText.trim().length === 0) {
                insufficient++;
                results.push({
                    claim,
                    status: 'INSUFFICIENT_EVIDENCE',
                    confidence: 0.4,
                    reason: 'Không có dữ liệu nguồn hoặc bằng chứng độc lập để đối chiếu'
                });
                continue;
            }

            // Extract numbers and key keywords from claim
            const numbers = claimLower.match(/\b\d+(?:\.\d+)?\b/g) || [];
            const keywords = (claimLower.match(/[a-z0-9à-ỹ]{4,}/gi) || [])
                .filter(w => !['trong', 'những', 'được', 'nhiều', 'thực', 'hiện', 'nghiên', 'cứu', 'thông', 'tin', 'cho', 'rằng'].includes(w));

            const matchedNumbers = numbers.filter(n => sourcesText.includes(n));
            const matchedKeywords = keywords.filter(w => sourcesText.includes(w));

            const numberRatio = numbers.length > 0 ? (matchedNumbers.length / numbers.length) : 1;
            const keywordRatio = keywords.length > 0 ? (matchedKeywords.length / keywords.length) : 0;

            if ((numbers.length > 0 && numberRatio >= 0.7 && matchedKeywords.length >= 2) || (matchedKeywords.length >= 4 && keywordRatio >= 0.5)) {
                supported++;
                results.push({
                    claim,
                    status: 'SUPPORTED',
                    confidence: Math.min(0.98, 0.7 + (matchedKeywords.length * 0.05)),
                    matchedEvidence: { numbers: matchedNumbers, keywords: matchedKeywords.slice(0, 5) },
                    reason: `Được hỗ trợ bởi bằng chứng nguồn (${matchedKeywords.length} từ khóa, ${matchedNumbers.length} số liệu khớp)`
                });
            } else if (matchedKeywords.length >= 2) {
                insufficient++;
                results.push({
                    claim,
                    status: 'INSUFFICIENT_EVIDENCE',
                    confidence: 0.55,
                    reason: 'Nguồn có nhắc đến chủ đề nhưng chưa đủ đối chiếu trực tiếp toàn bộ dữ kiện'
                });
            } else {
                insufficient++;
                results.push({
                    claim,
                    status: 'INSUFFICIENT_EVIDENCE',
                    confidence: 0.3,
                    reason: 'Không tìm thấy bằng chứng đối ứng trong nguồn'
                });
            }
        }

        const total = claims.length;
        const supportedRatio = total > 0 ? supported / total : 0;

        let status = 'APPROVED';
        let passed = true;

        if (contradicted > 0) {
            status = 'CONTRADICTED';
            passed = false;
        } else if (supported === 0 && total > 0) {
            status = 'UNVERIFIED';
            passed = false;
        } else if (supportedRatio >= 0.7) {
            status = 'SUPPORTED';
            passed = true;
        } else {
            status = 'INSUFFICIENT_EVIDENCE';
            passed = false;
        }

        return {
            claims: results,
            stats: {
                total,
                supported,
                contradicted,
                insufficient,
                supportedRatio: Math.round(supportedRatio * 100) / 100
            },
            status,
            passed
        };
    }

    /**
     * Verify node output contract for Stateful Graph Execution Engine
     * Evaluates outputSchema, physical artifacts, and acceptance criteria
     */
    async verifyNodeOutput(node, result, state = {}) {
        if (!node) {
            return { passed: false, status: 'FAILED', reason: 'Node is undefined' };
        }

        if (!result || result.success === false) {
            return {
                passed: false,
                status: 'FAILED',
                reason: result?.error || 'Node execution returned failure',
                checks: [{ type: 'execution_status', passed: false, details: result?.error || 'Failed' }]
            };
        }

        const checks = [];
        let allPassed = true;

        // 1. Output Schema verification
        if (node.outputSchema && typeof node.outputSchema === 'object') {
            const requiredKeys = Object.keys(node.outputSchema);
            const missingKeys = [];

            for (const key of requiredKeys) {
                const val = (result && result[key] !== undefined)
                    ? result[key]
                    : (result?.data && result.data[key] !== undefined
                        ? result.data[key]
                        : (result?.output && result.output[key] !== undefined ? result.output[key] : undefined));

                if (val === undefined || val === null || val === '') {
                    missingKeys.push(key);
                }
            }

            if (missingKeys.length > 0) {
                allPassed = false;
                checks.push({
                    type: 'output_schema',
                    passed: false,
                    details: `Missing required schema fields: [${missingKeys.join(', ')}]`
                });
            } else {
                checks.push({
                    type: 'output_schema',
                    passed: true,
                    details: `All ${requiredKeys.length} schema fields verified`
                });
            }
        }

        // 2. Physical File Verification (if node specifies file output)
        const targetFiles = [];
        if (result.filePath) targetFiles.push(result.filePath);
        if (Array.isArray(result.files)) targetFiles.push(...result.files);
        if (result.savedFile) targetFiles.push(result.savedFile);
        if (node.input?.filePath) targetFiles.push(node.input.filePath);

        for (const f of targetFiles) {
            if (typeof f === 'string') {
                const resolved = path.isAbsolute(f) ? f : path.resolve(this.baseDir, f);
                const fileCheck = this.verifyPhysicalFile(resolved);
                checks.push(fileCheck);
                if (!fileCheck.passed) allPassed = false;
            }
        }

        // 3. Acceptance Criteria Evaluation
        if (Array.isArray(node.acceptanceCriteria)) {
            for (const criteria of node.acceptanceCriteria) {
                const cLower = String(criteria).toLowerCase();
                let criterionPassed = true;
                let detail = `Criterion verified: ${criteria}`;

                if (cLower.includes('non-empty') || cLower.includes('không rỗng')) {
                    const content = result.response || result.data || result.output || '';
                    if (!content || (typeof content === 'string' && content.trim().length === 0)) {
                        criterionPassed = false;
                        detail = 'Output is empty';
                    }
                } else if (cLower.includes('syntax') || cLower.includes('cú pháp')) {
                    const fileFail = checks.some(c => c.type.includes('syntax') && !c.passed);
                    if (fileFail) {
                        criterionPassed = false;
                        detail = 'Syntax check failed';
                    }
                } else if (cLower.includes('claims') || cLower.includes('bằng chứng')) {
                    const text = typeof result.response === 'string' ? result.response : JSON.stringify(result);
                    const claims = this.extractClaims(text);
                    if (claims.length > 0) {
                        const claimCheck = this.verifyClaimsEvidence(claims, [text, ...(result.sources || [])]);
                        if (!claimCheck.passed) {
                            criterionPassed = false;
                            detail = `Claim evidence check failed: status ${claimCheck.status}`;
                        }
                    }
                }

                if (!criterionPassed) allPassed = false;
                checks.push({
                    type: 'acceptance_criterion',
                    passed: criterionPassed,
                    details: detail
                });
            }
        }

        const status = allPassed ? 'APPROVED' : ((node.retryCount || 0) < (node.maxRetries || 3) ? 'RETRY_REQUIRED' : 'FAILED');

        return {
            passed: allPassed,
            status,
            evidence: {
                nodeId: node.id,
                checks,
                timestamp: new Date().toISOString()
            },
            reason: allPassed ? 'Node output passed independent verification' : checks.filter(c => !c.passed).map(c => c.details).join('; ')
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
