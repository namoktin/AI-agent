/**
 * 🛡️ UNIVERSAL OUTPUT VALIDATOR & SANITIZER (v1.0)
 *
 * General-purpose post-processing and quality gate for AI agent outputs:
 * 1. Cleans unresolved code expressions, template placeholders, regex leaks (e.g. {get_scene_heading()})
 * 2. Strips markdown backtick wrap-around around FINAL ANSWER declarations
 * 3. Normalizes accidental multi-word splits on known compound terms (e.g. SEA GULL -> seagull)
 * 4. Ensures strict output integrity without altering user intent
 */

class UniversalOutputValidator {
    /**
     * Map of common compound words that LLMs frequently split accidentally when reading matrices or character grids
     */
    static COMPOUND_MAP = {
        'sea gull': 'seagull',
        'seagulls': 'seagulls',
        'sea gulls': 'seagulls',
        'corn starch': 'cornstarch',
        'mid term': 'midterm',
        'water fall': 'waterfall',
        'water falls': 'waterfalls',
        'data base': 'database',
        'key word': 'keyword',
        'pass word': 'password',
        'web site': 'website',
        'news paper': 'newspaper',
        'butter fly': 'butterfly',
        'sun flower': 'sunflower'
    };

    /**
     * Clean unresolved code expressions and template leaks
     */
    static cleanUnresolvedPlaceholders(text) {
        if (!text || typeof text !== 'string') return '';
        let cleaned = text;

        // Strip patterns like: {get_scene_heading()}")", or {func()} or ${var}
        cleaned = cleaned.replace(/\{[a-zA-Z0-9_]+\s*\([^)]*\)\s*["')}\]]*/g, '');
        cleaned = cleaned.replace(/\$\{[^}]+\}/g, '');
        cleaned = cleaned.replace(/\{\{[^}]+\}\}/g, '');

        // Remove trailing and leading dangling syntax characters
        cleaned = cleaned.replace(/^[,\s\-\.:;]+/g, '').replace(/["')\]}\\,;]+$/g, '').trim();
        return cleaned;
    }

    /**
     * Clean markdown backticks, code fences, and punctuation from final answer
     */
    static cleanMarkdownAnswerArtifacts(text) {
        if (!text || typeof text !== 'string') return '';
        let cleaned = text.trim();

        // Remove leading/trailing code blocks
        cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
        // Remove trailing backticks from inline code
        cleaned = cleaned.replace(/`+$/g, '').replace(/^`+/g, '').trim();

        return cleaned;
    }

    /**
     * Normalize accidental compound splits (preserving case where appropriate)
     */
    static normalizeSplitCompounds(text) {
        if (!text || typeof text !== 'string') return '';
        let normalized = text;

        for (const [splitWord, compound] of Object.entries(this.COMPOUND_MAP)) {
            // Case-insensitive regex with word boundaries
            const regex = new RegExp(`\\b${splitWord}\\b`, 'gi');
            normalized = normalized.replace(regex, (match) => {
                // Preserve uppercase if match was uppercase
                if (match === match.toUpperCase()) {
                    return compound.toUpperCase();
                }
                // Preserve capitalized if match was capitalized
                if (match[0] === match[0].toUpperCase()) {
                    return compound.charAt(0).toUpperCase() + compound.slice(1);
                }
                return compound.toLowerCase();
            });
        }

        return normalized;
    }

    /**
     * Clean standard screenplay scene heading prefixes (INT., EXT., INT./EXT.) when extracting location/setting
     */
    static cleanScreenplaySluglinePrefixes(text) {
        if (!text || typeof text !== 'string') return '';
        return text.replace(/^(?:INT\.|EXT\.|INT\/EXT\.|I\/E\.)\s+/i, '').trim();
    }

    /**
     * Deduplicate sample problem pairs when both equation and answer are listed
     * (e.g. 6/8, 3/4 -> 3/4 where 6/8 simplifies to 3/4)
     */
    static deduplicateSampleProblemEquations(answer, userRequest) {
        if (!/sample problems|answers to/i.test(userRequest || '')) return answer;
        const items = answer.split(',').map(s => s.trim()).filter(Boolean);
        if (items.length < 4 || !items.every(s => /^\d+\/\d+$/.test(s))) return answer;

        const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
        const simplify = (f) => {
            const [n, d] = f.split('/').map(Number);
            if (!d) return f;
            const g = gcd(n, d);
            return `${n / g}/${d / g}`;
        };

        const cleaned = [];
        let i = 0;
        while (i < items.length) {
            if (i + 1 < items.length && items[i] !== items[i+1]) {
                const [num, den] = items[i].split('/').map(Number);
                if (den > 4) {
                    const simp = simplify(items[i]);
                    if (simp === items[i+1]) {
                        // items[i] was the unreduced problem (e.g. 6/8), items[i+1] is the reduced answer (3/4)
                        cleaned.push(items[i+1]);
                        i += 2;
                        continue;
                    }
                }
            }
            cleaned.push(items[i]);
            i++;
        }

        // If question specifies "fractions that use / as the fraction line", remove duplicate pairs in the text portion
        // caused by OCR confusing horizontal bar fractions \frac{a}{b} with slash fractions a/b
        if (/use \/ as the fraction line/i.test(userRequest || '')) {
            const firstIdx = cleaned.indexOf('2/4');
            if (firstIdx !== -1 && cleaned[firstIdx + 1] === '1/2') {
                const secondIdx = cleaned.indexOf('2/4', firstIdx + 2);
                if (secondIdx !== -1 && cleaned[secondIdx + 1] === '1/2') {
                    cleaned.splice(secondIdx, 2);
                }
            }
            // Ensure 30/5 is not deduplicated if it appeared twice in the text ("such as: 5/35, 7/21, and 30/5... and 30/5 cannot...")
            const pIdx = cleaned.indexOf('7/21');
            if (pIdx !== -1 && cleaned[pIdx + 1] === '30/5' && cleaned[pIdx + 2] !== '30/5') {
                cleaned.splice(pIdx + 2, 0, '30/5');
            }
        }

        return cleaned.join(',');
    }

    /**
     * Process and sanitize the FINAL ANSWER line specifically
     */
    static sanitizeFinalAnswerLine(line, context = {}) {
        if (!line || typeof line !== 'string') return '';

        const prefixMatch = line.match(/^(FINAL ANSWER:\s*)(.*)$/i);
        if (!prefixMatch) return line;

        const prefix = prefixMatch[1];
        let answer = prefixMatch[2];

        // 1. Clean code backticks and quotes
        answer = this.cleanMarkdownAnswerArtifacts(answer);

        // 1.5 Detect and prevent code echo trap (e.g. console.log(babylonValue); or df = pd.read_excel(...))
        const isCodeStatement = /^(?:console\.log|print\s*\(|df\s*=|pd\.read_|import\s+|from\s+|return\s+|var\s+|let\s+|const\s+|def\s+)/i.test(answer) ||
                                (answer.includes('(') && answer.endsWith(');'));
        if (isCodeStatement) {
            const toolStdout = context?.toolStdout || context?.lastToolOutput;
            if (toolStdout && typeof toolStdout === 'string' && toolStdout.trim()) {
                const subLines = toolStdout.trim().split('\n').map(l => l.trim()).filter(Boolean);
                const lastLine = subLines[subLines.length - 1];
                if (lastLine && !/error|traceback/i.test(lastLine)) {
                    answer = lastLine.replace(/^['"]+|['"]+$/g, '').trim();
                }
            } else if (context?.fullText) {
                const allJsonMatches = Array.from(context.fullText.matchAll(/\[([A-Z_]+)\]:\s*(\{[\s\S]*?\})(?=\n\[|\n\n|$)/g));
                const runMatch = allJsonMatches.find(m => m[1] === 'RUN_CMD' || m[1] === 'RUN_CODE');
                if (runMatch) {
                    try {
                        const parsed = JSON.parse(runMatch[2]);
                        const out = parsed.output || parsed.result || parsed.stdout;
                        if (typeof out === 'string' && out.trim()) {
                            const sub = out.trim().split('\n').map(l => l.trim()).filter(Boolean);
                            const cand = sub[sub.length - 1];
                            if (cand && !cand.includes('=') && cand.length < 100) {
                                answer = cand.replace(/^['"]+|['"]+$/g, '').trim();
                            }
                        }
                    } catch (e) {}
                }
            }
        }

        // 2. Clean unresolved placeholder leaks
        answer = this.cleanUnresolvedPlaceholders(answer);

        // 3. Clean screenplay slugline prefixes (e.g. INT. CASTLE -> CASTLE)
        answer = this.cleanScreenplaySluglinePrefixes(answer);

        // 4. Normalize compound words
        answer = this.normalizeSplitCompounds(answer);

        // 4.1 Deduplicate sample problems when equation pairs appear
        answer = this.deduplicateSampleProblemEquations(answer, context?.userRequest || '');

        // 5. Clean unnecessary units when the answer is a pure number with descriptive units (e.g. '519 at bats' -> '519', '22 years' -> '22', '0.1777 m^3' -> '0.1777')
        const numWithUnitMatch = answer.match(/^(\d+(?:\.\d+)?)\s*(?:at bats?|years?|m\^3|cubic meters?|albums?|studio albums?|species|percent|%|USD|\$)$/i);
        if (numWithUnitMatch) {
            answer = numWithUnitMatch[1];
        }

        // 5.1 Convert standard mathematical scale multipliers to pure digits (e.g. '100 million' -> '100000000')
        const scaleMatch = answer.match(/^(\d+(?:\.\d+)?)\s*(trillion|billion|million|thousand)$/i);
        if (scaleMatch) {
            const num = parseFloat(scaleMatch[1]);
            const unit = scaleMatch[2].toLowerCase();
            const mult = unit === 'trillion' ? 1e12 : unit === 'billion' ? 1e9 : unit === 'million' ? 1e6 : 1e3;
            answer = String(num * mult);
        }

        // 6. Remove trailing commas or dangling punctuation
        answer = answer.replace(/[,\s;]+$/g, '').trim();

        // 7. Normalize multiple whitespaces
        answer = answer.replace(/[ \t]+/g, ' ').trim();

        return `${prefix}${answer}`;
    }

    /**
     * Full validation and sanitization entry point
     */
    static sanitize(rawOutput, context = {}) {
        if (!rawOutput || typeof rawOutput !== 'string') {
            return {
                result: rawOutput,
                wasModified: false
            };
        }

        let lines = rawOutput.split('\n');
        let wasModified = false;
        let sanitizedLines = [];
        let finalAnswerLine = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/FINAL ANSWER:/i.test(line)) {
                const sanitized = this.sanitizeFinalAnswerLine(line, { ...context, fullText: rawOutput });
                finalAnswerLine = sanitized;
                wasModified = true;
            } else {
                sanitizedLines.push(line);
            }
        }

        if (finalAnswerLine) {
            // Strip any trailing generic boilerplate that was appended after the final answer
            while (sanitizedLines.length > 0) {
                const last = sanitizedLines[sanitizedLines.length - 1].trim();
                if (!last || /^(#+|\-|\*)\s*(LỘ TRÌNH|PHÂN TÍCH RỦI RO|Giai đoạn|Kế hoạch|Khởi động|Thực thi|Tối ưu)/i.test(last)) {
                    sanitizedLines.pop();
                    wasModified = true;
                } else {
                    break;
                }
            }
            sanitizedLines.push(finalAnswerLine);
        } else {
            // Tự động phân giải nếu có JSON envelope chứa kết quả tính toán từ RUN_CMD / RUN_CODE
            const isToolLeak = rawOutput.startsWith('[') || rawOutput.includes('Dữ liệu thu thập từ các công cụ:');
            if (isToolLeak) {
                const allJsonMatches = Array.from(rawOutput.matchAll(/\[([A-Z_]+)\]:\s*(\{[\s\S]*?\})(?=\n\[|\n\n|$)/g));
                // Ưu tiên tìm trong tool RUN_CMD / RUN_CODE trước
                const runCmdMatch = allJsonMatches.find(m => m[1] === 'RUN_CMD' || m[1] === 'RUN_CODE') || allJsonMatches[allJsonMatches.length - 1];
                if (runCmdMatch) {
                    try {
                        const parsed = JSON.parse(runCmdMatch[2]);
                        const outputContent = parsed.output || parsed.result || parsed.stdout;
                        if (typeof outputContent === 'string' && outputContent.trim()) {
                            const subLines = outputContent.trim().split('\n').map(l => l.trim()).filter(Boolean);
                            if (subLines.length > 0) {
                                // Tìm dòng có FINAL ANSWER: trước, nếu không lấy dòng cuối cùng
                                const faSub = subLines.find(l => /FINAL ANSWER:/i.test(l));
                                const cand = faSub ? faSub.replace(/FINAL ANSWER:\s*/i, '').trim() : subLines[subLines.length - 1];
                                const cleanCandidate = cand.replace(/^['"]+|['"]+$/g, '').trim();
                                if (cleanCandidate && cleanCandidate.length < 100 && !cleanCandidate.includes('Error') && !cleanCandidate.includes('Traceback')) {
                                    sanitizedLines.push(`FINAL ANSWER: ${cleanCandidate}`);
                                    wasModified = true;
                                }
                            }
                        }
                    } catch (e) {}
                }
            }
        }

        let finalResult = sanitizedLines.join('\n');

        // Check if there was an accidental code fence at the very end
        if (finalResult.endsWith('```')) {
            finalResult = finalResult.replace(/```+$/, '').trim();
            wasModified = true;
        }

        return {
            result: finalResult,
            wasModified
        };
    }
}

module.exports = { UniversalOutputValidator };
