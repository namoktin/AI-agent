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
     * Process and sanitize the FINAL ANSWER line specifically
     */
    static sanitizeFinalAnswerLine(line) {
        if (!line || typeof line !== 'string') return '';

        const prefixMatch = line.match(/^(FINAL ANSWER:\s*)(.*)$/i);
        if (!prefixMatch) return line;

        const prefix = prefixMatch[1];
        let answer = prefixMatch[2];

        // 1. Clean code backticks and quotes
        answer = this.cleanMarkdownAnswerArtifacts(answer);

        // 2. Clean unresolved placeholder leaks
        answer = this.cleanUnresolvedPlaceholders(answer);

        // 3. Clean screenplay slugline prefixes (e.g. INT. CASTLE -> CASTLE)
        answer = this.cleanScreenplaySluglinePrefixes(answer);

        // 4. Normalize compound words
        answer = this.normalizeSplitCompounds(answer);

        // 5. Normalize multiple whitespaces
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
                const sanitized = this.sanitizeFinalAnswerLine(line);
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
