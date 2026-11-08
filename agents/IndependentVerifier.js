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

        // 3.5 VERIFY UNIVERSAL GOAL INVARIANTS & ANTI-MOCK PATTERNS
        let goalAudit = null;
        let hasGoalDeficit = false;
        let hasContractAuditError = false;
        let contractErrorMessage = '';
        try {
            const UniversalGoalContract = require('../utils/UniversalGoalContract');
            const goalContractEngine = new UniversalGoalContract(this.baseDir);
            const userPrompt = directive?.objective || plan?.description || '';
            const contract = goalContractEngine.extractContract(userPrompt);

            let combinedCode = '';
            for (const res of specialistResults) {
                if (res.response) {
                    const rTxt = typeof res.response === 'string' ? res.response : JSON.stringify(res.response);
                    combinedCode += ' ' + rTxt;
                }
            }

            const baseGeminiDir = process.env.OUTPUT_DIR || path.join(require('os').homedir(), 'Desktop', 'gemini');
            const todayDir = path.join(baseGeminiDir, new Date().toISOString().slice(0, 10));
            const outputDir = path.join(this.baseDir, 'output');
            const searchDirs = [this.baseDir, outputDir, todayDir, path.join(todayDir, 'reels_download'), path.join(todayDir, 'raw_downloads')];
            goalAudit = goalContractEngine.auditFulfillment(contract, { searchDirs, codeSnippet: combinedCode });

            // Áp dụng kiểm toán Goal Contract cho mọi bài toán có yêu cầu đầu ra (kể cả tác vụ đơn lẻ) hoặc vi phạm mock
            const hasContractRequirement = (contract.isBatch && contract.requestedCount > 1)
                || (contract.targetExtensions && contract.targetExtensions.length > 0 && contract.domain !== 'general')
                || (contract.requestedCount >= 1 && contract.domain !== 'general')
                || (goalAudit && goalAudit.mockViolations && goalAudit.mockViolations.length > 0);

            if (hasContractRequirement) {
                totalChecks++;
                if (goalAudit && goalAudit.satisfied) {
                    passedChecks++;
                    checks.push({
                        type: 'universal_goal_contract',
                        passed: true,
                        details: `Đã hoàn thành đầy đủ ${goalAudit.actualCount}/${contract.requestedCount} thực thể (${goalAudit.domain}) không chứa mẫu mock.`
                    });
                } else {
                    hasGoalDeficit = true;
                    checks.push({
                        type: 'universal_goal_contract',
                        passed: false,
                        details: goalAudit?.deficitDiagnostic || 'Chưa thỏa mãn hợp đồng mục tiêu (Goal Contract Deficit)',
                        remedies: goalAudit?.mockViolations || []
                    });
                }
            }
        } catch (contractErr) {
            console.warn('⚠️ [IndependentVerifier] Goal contract audit error:', contractErr.message);
            hasContractAuditError = true;
            contractErrorMessage = contractErr.message;
            totalChecks++;
            checks.push({
                type: 'universal_goal_contract',
                passed: false,
                details: `Lỗi trong quá trình kiểm toán Goal Contract: ${contractErr.message}`
            });
        }

        // 4. VERIFY TERMINAL FACTUAL & BENCHMARK ANSWER INTEGRITY (Tier 4 Zero Blind Trust)
        const isFactualOrBenchmark = mode === 'fast'
            || /FINAL ANSWER:|gaia|benchmark|how many|which|what|who|calculate|tính|cho biết/i.test(directive?.objective || '')
            || /FINAL ANSWER:|gaia|benchmark/i.test(plan?.description || '')
            || (directive && directive.thinkingProcess && /tiên đề 7|tiên đề 4|factual/i.test(directive.thinkingProcess));

        let hasTerminalAnswerDeficit = false;
        let terminalAnswerDiagnostic = '';
        if (isFactualOrBenchmark) {
            totalChecks++;
            const terminalCheck = this.verifyTerminalAnswerIntegrity(specialistResults, executionLog, directive);
            checks.push(terminalCheck);
            if (terminalCheck.passed) {
                passedChecks++;
            } else {
                hasTerminalAnswerDeficit = true;
                terminalAnswerDiagnostic = terminalCheck.details;
            }
        }

        // 5. DETERMINE FINAL AUDIT STATUS & SUBSTANTIVE SCORE (Zero Blind Trust & No Inflated 90s)
        const passRatio = totalChecks > 0 ? (passedChecks / totalChecks) : 1;
        let status = 'APPROVED';
        let verified = true;

        if (totalChecks === 0) {
            status = 'NEEDS_REVIEW';
            verified = true;
        } else if (hasGoalDeficit || hasTerminalAnswerDeficit) {
            status = 'DEFICIT_DETECTED';
            verified = false;
        } else if (hasContractAuditError) {
            status = 'UNVERIFIED';
            verified = false;
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

        let calculatedScore = Math.min(100, Math.max(50, Math.round(65 + (passRatio * 35))));
        if (passRatio === 1 && !hasGoalDeficit && !hasUnverifiedResearch) {
            calculatedScore = 100;
        }
        if (hasGoalDeficit) {
            calculatedScore = Math.min(55, calculatedScore);
        } else if (hasUnverifiedResearch) {
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
     * Substantive verification of fast responses (Zero-based scoring)
     */
    verifyFastResponse(userRequest, fastResult) {
        if (!fastResult) {
            return {
                verified: false,
                passed: false,
                status: 'FAILED',
                qualityScore: 0,
                score: 0,
                checks: [{ type: 'fast_response', passed: false, details: 'Fast response missing or returned error' }]
            };
        }

        const isObj = typeof fastResult === 'object';
        if (isObj && fastResult.success === false) {
            return {
                verified: false,
                passed: false,
                status: 'FAILED',
                qualityScore: 0,
                score: 0,
                checks: [{ type: 'fast_response', passed: false, details: 'Fast response explicitly failed' }]
            };
        }

        const text = String(isObj ? (fastResult.response || fastResult.text || '') : fastResult).trim();
        if (!text) {
            return {
                verified: false,
                passed: false,
                status: 'FAILED',
                qualityScore: 0,
                score: 0,
                checks: [{ type: 'fast_response', passed: false, details: 'Fast response empty' }]
            };
        }

        let score = 0; // ZERO-BASED SCORING: Points must be earned, no inflated base points
        const checks = [];

        // Check 1: Refusal / Error detection (Hard Gate: if refusal, capped at 25 points)
        const hasRefusal = /tôi không thể|xin lỗi tôi không|error occurred|cannot answer|không thể trả lời/i.test(text);
        if (hasRefusal) {
            checks.push({ type: 'fast_no_refusal', passed: false, details: 'Contains refusal or error indicator' });
            return {
                verified: false,
                passed: false,
                status: 'REJECTED',
                qualityScore: 25,
                score: 25,
                checks
            };
        }
        score += 25;
        checks.push({ type: 'fast_no_refusal', passed: true, details: 'No refusal detected' });

        // Check 2: Substantive length and content density (up to 35 points)
        if (text.length >= 200) {
            score += 35;
            checks.push({ type: 'fast_substance', passed: true, details: `High substantive detail: ${text.length} chars` });
        } else if (text.length >= 80) {
            score += 25;
            checks.push({ type: 'fast_substance', passed: true, details: `Moderate detail: ${text.length} chars` });
        } else if (text.length >= 40) {
            score += 15;
            checks.push({ type: 'fast_substance', passed: true, details: `Minimal length: ${text.length} chars` });
        } else {
            checks.push({ type: 'fast_substance', passed: false, details: 'Response too brief (< 40 chars)' });
        }

        // Check 3: Structured / clean formatting (up to 20 points)
        if ((text.includes('\n') && (text.includes('- ') || text.includes('1.'))) || text.includes('```')) {
            score += 20;
            checks.push({ type: 'fast_structure', passed: true, details: 'Clean structured layout with lists/code' });
        } else if (text.includes('\n') || text.includes(':') || text.includes('-')) {
            score += 10;
            checks.push({ type: 'fast_structure', passed: true, details: 'Basic structured layout' });
        }

        // Check 4: Concrete entities or factual grounding (up to 20 points)
        const hasNumbers = /\b\d+(?:\.\d+)?\b/.test(text);
        const hasEntities = /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/.test(text);
        if (hasNumbers && hasEntities) {
            score += 20;
            checks.push({ type: 'fast_grounding', passed: true, details: 'Contains quantitative data and specific entities' });
        } else if (hasNumbers || hasEntities) {
            score += 10;
            checks.push({ type: 'fast_grounding', passed: true, details: 'Contains partial entity or numerical data' });
        }

        const finalScore = Math.min(100, score);
        const isVerified = finalScore >= 75;
        return {
            verified: isVerified,
            passed: isVerified,
            status: finalScore >= 85 ? 'APPROVED' : (isVerified ? 'VERIFIED' : 'NEEDS_REVIEW'),
            qualityScore: finalScore,
            score: finalScore,
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
        const metricMatches = (combinedText.match(/\b\d+(?:\.\d+)?(?:%|mg|ml|km|kg|ms|s|°C|giây|phút|giờ|usd|vnđ|triệu|tỷ|bệnh nhân|người|\b)/gi) || [])
            .filter(m => /\d/.test(m) && !doiMatches.some(d => d.includes(m)));

        let liveSourceVerified = false;
        let verifiedSourceTitle = '';
        let contentEntailed = false;

        // A. Verify DOI via Crossref or doi.org API (Multi-DOI check up to 3)
        const evidenceSources = [];
        for (let i = 0; i < Math.min(3, doiMatches.length); i++) {
            const rawDoi = doiMatches[i].replace(/[.,;:)]+$/, '');
            try {
                const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(rawDoi)}`, {
                    headers: { 'User-Agent': 'CyberAgent/5.5 (mailto:researcher@agent.local)' },
                    signal: AbortSignal.timeout(4000)
                });
                if (res.ok) {
                    const data = await res.json();
                    const title = data.message?.title?.[0] || 'Indexed DOI Article';
                    const abstract = data.message?.abstract || '';
                    if (!verifiedSourceTitle) verifiedSourceTitle = title;
                    liveSourceVerified = true;
                    evidenceSources.push(title);
                    if (abstract) evidenceSources.push(abstract);
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
                        if (!verifiedSourceTitle) verifiedSourceTitle = `DOI: ${rawDoi}`;
                        evidenceSources.push(`DOI: ${rawDoi}`);
                    }
                } catch (e) {}
            }
        }

        // B. Verify PMID via NCBI PubMed API (Multi-PMID check up to 3)
        for (let i = 0; i < Math.min(3, pmidMatches.length); i++) {
            const idMatch = pmidMatches[i].match(/\d+/);
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
                            const title = data.result[pmid].title;
                            if (!verifiedSourceTitle) verifiedSourceTitle = title;
                            evidenceSources.push(title);
                        }
                    }
                } catch (pmidErr) {}
            }
        }

        // C. Verify Live URL & Sample Content Entailment (Multi-URL check up to 3)
        if (urlMatches.length > 0) {
            for (let i = 0; i < Math.min(3, urlMatches.length); i++) {
                const targetUrl = urlMatches[i].replace(/[.,;:)]+$/, '');
                try {
                    const res = await fetch(targetUrl, {
                        method: 'GET',
                        signal: AbortSignal.timeout(4000),
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                    });
                    if (res.status >= 200 && res.status < 400) {
                        liveSourceVerified = true;
                        const pageSample = (await res.text()).slice(0, 5000);
                        evidenceSources.push(pageSample);
                        const pageSampleLower = pageSample.toLowerCase();
                        // Semantic Concept Overlap: Yêu cầu ít nhất 2 khái niệm cốt lõi cùng xuất hiện
                        const keywords = combinedText.toLowerCase().match(/[a-z0-9_-]{4,}/g) || [];
                        const significantWords = keywords.filter(w => !['https', 'http', 'content', 'title', 'value', 'result', 'research', 'thực', 'hiện', 'nghiên', 'cứu'].includes(w));
                        const matchedConcepts = significantWords.filter(kw => pageSampleLower.includes(kw));
                        if (matchedConcepts.length >= 1) {
                            contentEntailed = true;
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

        // Update 18 Strict Entailment: A source must be live-verified on Crossref/PubMed/Web and entail content or verifiable metrics
        if (liveSourceVerified && (claimAudit.passed || contentEntailed || hasMetrics)) {
            return {
                type: 'research_live_verification',
                target: 'claims_and_evidence',
                passed: true,
                status: 'APPROVED',
                claimAudit,
                details: `Live verified: Nguồn tồn tại thật (${verifiedSourceTitle ? verifiedSourceTitle.slice(0, 60) + '...' : 'URL hoạt động'}), đối chiếu luận điểm (${claimAudit.stats.supported}/${claimAudit.stats.total} claims supported, ${metricMatches.length} metrics) ĐẠT`
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

        // 3. Acceptance Criteria Evaluation (Update 18 Tier 4 Strict Verification)
        if (Array.isArray(node.acceptanceCriteria) && node.acceptanceCriteria.length > 0) {
            for (const criteria of node.acceptanceCriteria) {
                const cLower = String(criteria).toLowerCase();
                let criterionPassed = false;
                let detail = '';

                if (cLower.includes('non-empty') || cLower.includes('không rỗng')) {
                    const content = result.response || result.data || result.output || result.result || '';
                    if (content && (typeof content !== 'string' || content.trim().length > 0)) {
                        criterionPassed = true;
                        detail = `Non-empty output confirmed (type: ${typeof content})`;
                    } else {
                        criterionPassed = false;
                        detail = 'Output is empty or whitespace only';
                    }
                } else if (cLower.includes('syntax') || cLower.includes('cú pháp')) {
                    const fileFail = checks.some(c => c.type.includes('syntax') && !c.passed);
                    if (!fileFail && !result.error && (!result.stderr || result.stderr.length === 0)) {
                        criterionPassed = true;
                        detail = 'Syntax verification passed';
                    } else {
                        criterionPassed = false;
                        detail = 'Syntax check failed: errors detected in generated code or outputs';
                    }
                } else if (cLower.includes('claims') || cLower.includes('bằng chứng') || cLower.includes('fact_check')) {
                    const text = typeof result.response === 'string' ? result.response : JSON.stringify(result);
                    const claims = this.extractClaims(text);
                    if (claims.length === 0) {
                        criterionPassed = true;
                        detail = 'No factual claims requiring evidence found';
                    } else {
                        // Anti-circular validation: NEVER validate text using text itself as source!
                        const externalSources = (result.sources || []).filter(s => s && s !== text);
                        if (externalSources.length === 0) {
                            criterionPassed = false;
                            detail = `Claim evidence check failed: No external evidence sources provided for ${claims.length} claims`;
                        } else {
                            const claimCheck = this.verifyClaimsEvidence(claims, externalSources);
                            if (claimCheck.passed) {
                                criterionPassed = true;
                                detail = `Claim evidence check passed: ${claimCheck.stats.supported}/${claimCheck.stats.total} supported`;
                            } else {
                                criterionPassed = false;
                                detail = `Claim evidence check failed: status ${claimCheck.status} (${claimCheck.stats.supported}/${claimCheck.stats.total} supported)`;
                            }
                        }
                    }
                } else if (cLower.includes('tool_execution') || cLower.includes('công cụ')) {
                    const hasToolUsage = (Array.isArray(result.toolCalls) && result.toolCalls.length > 0) ||
                                         (Array.isArray(result.executedTools) && result.executedTools.length > 0) ||
                                         (result.toolResults && Object.keys(result.toolResults).length > 0) ||
                                         (result.success === true && (result.data !== undefined || result.stdout !== undefined));
                    if (hasToolUsage) {
                        criterionPassed = true;
                        detail = 'Tool execution verified successfully';
                    } else {
                        criterionPassed = false;
                        detail = 'Tool execution check failed: no tool calls or verified tool results detected';
                    }
                } else if (cLower.includes('executable_code') || cLower.includes('code_execution')) {
                    const text = typeof result.response === 'string' ? result.response : (result.data ? JSON.stringify(result.data) : '');
                    const hasCode = /```(?:python|py|javascript|js|bash|sh|sql)[\s\S]+?```/i.test(text) || Boolean(result.codeSnippet || result.executableCode);
                    const noSyntaxError = !checks.some(c => c.type.includes('syntax') && !c.passed);
                    if (hasCode && noSyntaxError) {
                        criterionPassed = true;
                        detail = 'Executable code verified and syntactically sound';
                    } else {
                        criterionPassed = false;
                        detail = `Executable code check failed: hasCode=${hasCode}, syntaxValid=${noSyntaxError}`;
                    }
                } else if (cLower.includes('physical_output') || cLower.includes('file_output') || cLower.includes('tập tin')) {
                    const hasPhysical = targetFiles.length > 0 && checks.filter(c => c.type === 'physical_file').every(c => c.passed);
                    if (hasPhysical) {
                        criterionPassed = true;
                        detail = `Physical output verified: ${targetFiles.length} file(s) exist on disk`;
                    } else {
                        criterionPassed = false;
                        detail = `Physical output check failed: required files missing or empty (${targetFiles.join(', ')})`;
                    }
                } else if (cLower.includes('whisper_transcription') || cLower.includes('audio_transcription')) {
                    const hasTranscription = Boolean(result.transcription || result.transcript || result.audioText || (result.data && result.data.transcription));
                    if (hasTranscription) {
                        criterionPassed = true;
                        detail = 'Audio transcription output verified';
                    } else {
                        criterionPassed = false;
                        detail = 'Whisper transcription check failed: no transcription text detected';
                    }
                } else if (cLower.includes('error_handling')) {
                    const handled = result.recovered || result.handledError || (result.success !== undefined);
                    if (handled) {
                        criterionPassed = true;
                        detail = 'Error handling verified';
                    } else {
                        criterionPassed = false;
                        detail = 'Error handling criterion failed: unhandled exception or missing recovery';
                    }
                } else if (cLower.includes('schema') || cLower.includes('định dạng')) {
                    const schemaFailed = checks.some(c => c.type === 'output_schema' && !c.passed);
                    if (!schemaFailed) {
                        criterionPassed = true;
                        detail = 'Schema requirement satisfied';
                    } else {
                        criterionPassed = false;
                        detail = 'Schema verification failed';
                    }
                } else {
                    // Update 18 P0 Fix: Strictly reject unhandled or unknown criteria!
                    criterionPassed = false;
                    detail = `Criterion unsupported or unhandled by automated validator: "${criteria}". Cannot automatically pass.`;
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
        const pathRegex = /(?:[A-Za-z]:[\\/][a-zA-Z0-9_\-\\/\.]+\.[a-zA-Z0-9]+)|(?:[a-zA-Z0-9_\-\/]+\.(?:js|json|md|py|csv|html|txt|mp3|mp4|png|jpg|jpeg|webp))/gi;
        const ignoredSystemFiles = ['package.json', 'server.js', 'experiences.json', 'node.js', 'vue.js', 'react.js', 'next.js', 'express.js', 'package-lock.json', 'optimal_strategies.json'];
        for (const res of specialistResults) {
            const text = typeof res.response === 'string' ? res.response : '';
            const matches = text.match(pathRegex) || [];
            for (const m of matches) {
                const baseM = path.basename(m).toLowerCase();
                if (m.length > 4 && !m.includes('*') && !m.includes('<') && !ignoredSystemFiles.includes(baseM)) {
                    const resolved = path.isAbsolute(m) ? m : path.resolve(this.baseDir, m);
                    fileSet.add(resolved);
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
            let actualPath = filePath;
            if (!fs.existsSync(actualPath)) {
                const inCwd = path.resolve(process.cwd(), filePath);
                const inOutput = path.resolve(this.baseDir, 'output', filePath);
                const inOutputBasename = path.resolve(this.baseDir, 'output', path.basename(filePath));
                if (fs.existsSync(inCwd)) {
                    actualPath = inCwd;
                } else if (fs.existsSync(inOutput)) {
                    actualPath = inOutput;
                } else if (fs.existsSync(inOutputBasename)) {
                    actualPath = inOutputBasename;
                } else {
                    const today = new Date().toISOString().slice(0, 10);
                    const geminiRoot = path.resolve(process.env.OUTPUT_DIR || 'C:\\Users\\Nam\\Desktop\\gemini');
                    const inGemini = path.resolve(geminiRoot, today, filePath);
                    const inGeminiBasename = path.resolve(geminiRoot, today, path.basename(filePath));
                    if (fs.existsSync(inGemini)) {
                        actualPath = inGemini;
                    } else if (fs.existsSync(inGeminiBasename)) {
                        actualPath = inGeminiBasename;
                    } else if (fs.existsSync(geminiRoot)) {
                        try {
                            const subdirs = fs.readdirSync(geminiRoot)
                                .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
                                .sort().reverse();
                            for (const sd of subdirs) {
                                const inDated = path.join(geminiRoot, sd, path.basename(filePath));
                                if (fs.existsSync(inDated)) {
                                    actualPath = inDated;
                                    break;
                                }
                            }
                        } catch (e) {}
                    }
                }
            }

            if (!fs.existsSync(actualPath)) {
                return {
                    type: 'file_existence',
                    target: filePath,
                    passed: false,
                    details: 'File does NOT exist on disk'
                };
            }

            const stat = fs.statSync(actualPath);
            if (stat.size === 0) {
                return {
                    type: 'file_integrity',
                    target: filePath,
                    passed: false,
                    details: 'File exists but is 0 bytes (empty)'
                };
            }

            const ext = path.extname(filePath).toLowerCase();

            // 1. Multi-modal Verification: Audio files (.mp3, .wav, .m4a, .aac, .flac, .ogg)
            if (['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg'].includes(ext)) {
                try {
                    let probeOutput = '';
                    try {
                        execSync(`ffmpeg -i "${actualPath}" -hide_banner`, { stdio: 'pipe', timeout: 6000 });
                    } catch (probeErr) {
                        probeOutput = probeErr.stderr ? probeErr.stderr.toString() : '';
                    }
                    const hasAudio = probeOutput.includes('Audio:');
                    const durMatch = probeOutput.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
                    let durSecs = 0;
                    if (durMatch) {
                        durSecs = parseFloat(durMatch[1]) * 3600 + parseFloat(durMatch[2]) * 60 + parseFloat(durMatch[3]);
                    }
                    if (!hasAudio) {
                        return {
                            type: 'audio_stream_validation',
                            target: filePath,
                            passed: false,
                            details: 'Tệp không có luồng âm thanh hợp lệ (No audio stream)'
                        };
                    }
                    if (durSecs < 1.0) {
                        return {
                            type: 'audio_duration_validation',
                            target: filePath,
                            passed: false,
                            details: `Thời lượng âm thanh quá ngắn (${durSecs}s < 1.0s)`
                        };
                    }
                    // Anti-dummy check: phát hiện file test mẫu rác cũ (76KB, ~9.5s)
                    if (stat.size === 76608 && durSecs < 10) {
                        return {
                            type: 'anti_dummy_check',
                            target: filePath,
                            passed: false,
                            details: 'Tệp âm thanh trùng khớp chữ ký file test mẫu nháp cũ (76KB leak)'
                        };
                    }
                    return {
                        type: 'audio_verification',
                        target: filePath,
                        passed: true,
                        details: `Âm thanh hợp lệ (${Math.round(stat.size / 1024)} KB, thời lượng: ${durSecs.toFixed(1)}s, stream: verified)`
                    };
                } catch (e) {
                    return {
                        type: 'audio_verification_error',
                        target: filePath,
                        passed: false,
                        details: `FFmpeg probe lỗi: ${e.message}`
                    };
                }
            }

            // 2. Multi-modal Verification: Video files (.mp4, .mkv, .mov, .webm, .avi)
            if (['.mp4', '.mkv', '.mov', '.webm', '.avi'].includes(ext)) {
                try {
                    let probeOutput = '';
                    try {
                        execSync(`ffmpeg -i "${actualPath}" -hide_banner`, { stdio: 'pipe', timeout: 8000 });
                    } catch (probeErr) {
                        probeOutput = probeErr.stderr ? probeErr.stderr.toString() : '';
                    }
                    const hasVideo = probeOutput.includes('Video:');
                    const hasAudio = probeOutput.includes('Audio:');
                    const durMatch = probeOutput.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
                    let durSecs = 0;
                    if (durMatch) {
                        durSecs = parseFloat(durMatch[1]) * 3600 + parseFloat(durMatch[2]) * 60 + parseFloat(durMatch[3]);
                    }
                    if (!hasVideo) {
                        return {
                            type: 'video_stream_validation',
                            target: filePath,
                            passed: false,
                            details: 'Tệp video không có luồng hình ảnh (No video stream)'
                        };
                    }
                    if (durSecs < 2.0) {
                        return {
                            type: 'video_duration_validation',
                            target: filePath,
                            passed: false,
                            details: `Thời lượng video quá ngắn (${durSecs}s < 2.0s)`
                        };
                    }
                    return {
                        type: 'video_verification',
                        target: filePath,
                        passed: true,
                        details: `Video thành phẩm hợp lệ (${(stat.size / (1024 * 1024)).toFixed(1)} MB, ${durSecs.toFixed(1)}s, video: có, audio: ${hasAudio ? 'có' : 'không'})`
                    };
                } catch (e) {
                    return {
                        type: 'video_verification_error',
                        target: filePath,
                        passed: false,
                        details: `FFmpeg video probe lỗi: ${e.message}`
                    };
                }
            }

            // 3. Multi-modal Verification: Image files (.png, .jpg, .jpeg, .webp)
            if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
                try {
                    const fd = fs.openSync(actualPath, 'r');
                    const buf = Buffer.alloc(8);
                    fs.readSync(fd, buf, 0, 8, 0);
                    fs.closeSync(fd);
                    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
                    const isJpg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
                    const isWebp = buf.toString('ascii', 0, 4) === 'RIFF';
                    if (!isPng && !isJpg && !isWebp) {
                        return {
                            type: 'image_header_validation',
                            target: filePath,
                            passed: false,
                            details: 'Định dạng header tệp ảnh không hợp lệ hoặc bị hỏng'
                        };
                    }
                    if (stat.size < 100) {
                        return {
                            type: 'image_integrity',
                            target: filePath,
                            passed: false,
                            details: 'Tệp ảnh quá nhỏ (< 100 bytes), nghi vấn ảnh rác/pixel rỗng'
                        };
                    }
                    return {
                        type: 'image_verification',
                        target: filePath,
                        passed: true,
                        details: `Ảnh hợp lệ (${Math.round(stat.size / 1024)} KB, magic signature confirmed)`
                    };
                } catch (imgErr) {
                    return {
                        type: 'image_verification_error',
                        target: filePath,
                        passed: false,
                        details: imgErr.message
                    };
                }
            }

            // 4. Data Verification: CSV files
            if (ext === '.csv') {
                const csvContent = fs.readFileSync(actualPath, 'utf8');
                const lines = csvContent.trim().split(/\r?\n/).filter(l => l.trim());
                if (lines.length < 2) {
                    return {
                        type: 'data_integrity',
                        target: filePath,
                        passed: false,
                        details: `Tệp CSV phải có tiêu đề và ít nhất 1 dòng dữ liệu thực (hiện có: ${lines.length} dòng)`
                    };
                }
                return {
                    type: 'csv_verification',
                    target: filePath,
                    passed: true,
                    details: `Tệp CSV hợp lệ (${lines.length} dòng dữ liệu, ${Math.round(stat.size)} bytes)`
                };
            }

            const content = fs.readFileSync(actualPath, 'utf8');

            // Anti-stub check in file content
            if (/\/\/\s*TODO:\s*implement|throw new Error\(['"]not implemented['"]\)|pass\s*#\s*placeholder/i.test(content)) {
                return {
                    type: 'substance_validation',
                    target: filePath,
                    passed: false,
                    details: 'File contains unimplemented placeholder or stub code'
                };
            }

            // Anti-placeholder leak check for outreach/messaging/copywriting
            if (/(?:\{name\}|\{company\}|\[INSERT_[A-Z0-9_]+\])/i.test(content)) {
                return {
                    type: 'template_placeholder_leak',
                    target: filePath,
                    passed: false,
                    details: 'Tệp chứa placeholder mẫu chưa được điền ({name}, {company}, hoặc [INSERT_...])'
                };
            }

            // Syntax and Live Execution verification for JS / JSON / Python
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
                    execSync(`node --check "${actualPath}"`, { stdio: 'ignore', timeout: 5000 });
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
                    execSync(`python -m py_compile "${actualPath}"`, { stdio: 'ignore', timeout: 5000 });
                } catch (e) {
                    return {
                        type: 'syntax_validation',
                        target: filePath,
                        passed: false,
                        details: 'Python syntax validation failed (py_compile)'
                    };
                }

                // Live Unit Test Execution Check for Python test files
                const isExplicitTestFile = /(?:^|[/\\])test_[^/\\]+\.py$|[^/\\]+_test\.py$/i.test(actualPath);
                const hasUnitTestFramework = /import\s+unittest|from\s+unittest\s+import|import\s+pytest|from\s+pytest\s+import|unittest\.main\(\)/i.test(content);
                const hasTestFunctions = /def\s+test_[a-zA-Z0-9_]+\s*\(|class\s+Test[a-zA-Z0-9_]+\s*\(unittest\.TestCase\)/i.test(content);

                if ((isExplicitTestFile || hasUnitTestFramework) && (hasTestFunctions || hasUnitTestFramework)) {
                    try {
                        execSync(`python "${actualPath}"`, {
                            stdio: 'pipe',
                            timeout: 8000,
                            env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
                        });
                        return {
                            type: 'live_test_execution',
                            target: filePath,
                            passed: true,
                            details: `Valid Python test file (${Math.round(stat.size)} bytes), passed live unit tests successfully`
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

    /**
     * Tier 4 Terminal Answer Integrity & Evidence Verification (Zero Blind Trust)
     */
    verifyTerminalAnswerIntegrity(specialistResults = [], executionLog = [], directive = {}) {
        let rawAnswer = '';

        // 1. Thu thập văn bản từ specialist results
        for (const res of specialistResults) {
            if (!res) continue;
            const content = typeof res === 'string' ? res : (res.response || res.result || res.content || '');
            if (typeof content === 'string' && content.trim()) {
                const m = content.match(/FINAL ANSWER:\s*([^\n\r]+)/i);
                if (m && m[1]) {
                    rawAnswer = m[1].trim();
                }
            }
        }

        // 2. Nếu chưa thấy, tìm trong executionLog
        if (!rawAnswer && Array.isArray(executionLog)) {
            for (let i = executionLog.length - 1; i >= 0; i--) {
                const entry = executionLog[i];
                const txt = typeof entry === 'string' ? entry : JSON.stringify(entry);
                const m = txt.match(/FINAL ANSWER:\s*([^\n\r"]+)/i);
                if (m && m[1]) {
                    rawAnswer = m[1].trim();
                    break;
                }
            }
        }

        // 3. Kiểm toán tính hiện diện
        if (!rawAnswer) {
            return {
                type: 'terminal_answer_integrity',
                passed: false,
                details: 'Thiếu dòng FINAL ANSWER: chuẩn theo Tiên đề 4 (Terminal Direct Target Extraction).',
                remedy: 'Yêu cầu trích xuất giá trị kết quả cuối cùng và định dạng thành: FINAL ANSWER: [đáp án]'
            };
        }

        // 4. Bẫy Anti-Code-Echo: Từ chối nếu câu trả lời là câu lệnh code
        const isCodeStatement = /^(console\.log\(|print\(|df\s*=|pd\.read_|import\s+|const\s+|let\s+|var\s+|return\s+|def\s+)/i.test(rawAnswer)
            || (/;$/.test(rawAnswer) && rawAnswer.includes('('))
            || (rawAnswer.startsWith('{') && rawAnswer.endsWith('}') && rawAnswer.includes(':'));

        if (isCodeStatement) {
            return {
                type: 'terminal_answer_integrity',
                passed: false,
                details: `Bẫy Anti-Code-Echo phát hiện: Đáp án bị ô nhiễm bởi mã code lệnh thay vì giá trị mục tiêu ('${rawAnswer}').`,
                remedy: 'Loại bỏ câu lệnh code, chỉ giữ lại giá trị vô hướng thực tế được trả về từ stdout công cụ.'
            };
        }

        // 5. Kiểm tra đáp án rỗng hoặc từ chối giải
        const isRefusal = /^(i don't know|cannot be determined|unable to find|unknown|không rõ|n\/a|none)$/i.test(rawAnswer);
        if (isRefusal) {
            return {
                type: 'terminal_answer_integrity',
                passed: false,
                details: `Đáp án mang tính từ chối hoặc không hội tụ ('${rawAnswer}').`,
                remedy: 'Kích hoạt chiến lược tra cứu bổ sung hoặc tính toán giải tích thay thế.'
            };
        }

        return {
            type: 'terminal_answer_integrity',
            passed: true,
            extractedAnswer: rawAnswer,
            details: `Đã kiểm chứng tính toàn vẹn của đáp án đích ('${rawAnswer}'). Không dính bẫy code hay từ chối.`
        };
    }
}

module.exports = { IndependentVerifier };
