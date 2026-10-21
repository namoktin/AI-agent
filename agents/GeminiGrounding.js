/**
 * 🔍 GEMINI GROUNDING WITH GOOGLE SEARCH
 *
 * Tích hợp native Google Search vào Gemini để có real-time data
 * - Automatic fact-checking
 * - Citation generation
 * - Up-to-date information
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Fetch polyfill
function fetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const requestOptions = {
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: options.signal?._timeout || 180000
        };

        const req = client.request(url, requestOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    json: async () => JSON.parse(data),
                    text: async () => data
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (options.body) {
            req.write(options.body);
        }

        req.end();
    });
}

class GeminiGrounding {
    constructor(geminiApiKey) {
        this.apiKey = geminiApiKey;
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        this.models = {
            flash: 'gemini-2.0-flash-exp',
            pro: 'gemini-1.5-pro'
        };
    }

    /**
     * Generate content with Google Search grounding
     */
    async generateWithGrounding(prompt, options = {}) {
        const {
            model = 'flash',
            temperature = 0.5,
            dynamicThreshold = 0.3, // Lower = more grounding
            includeSearchQueries = true
        } = options;

        const modelName = this.models[model] || model;

        try {
            const response = await fetch(
                `${this.baseUrl}/models/${modelName}:generateContent?key=${this.apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            role: 'user',
                            parts: [{ text: prompt }]
                        }],
                        tools: [{
                            googleSearch: {} // Enable native Google Search
                        }],
                        generationConfig: {
                            temperature: temperature,
                            maxOutputTokens: 8192
                        },
                        // Grounding configuration
                        groundingConfig: {
                            retrieveConfig: {
                                dynamicRetrievalConfig: {
                                    mode: 'MODE_DYNAMIC',
                                    dynamicThreshold: dynamicThreshold
                                }
                            }
                        }
                    })
                }
            );

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Grounding API error: ${error}`);
            }

            const data = await response.json();

            // Extract response and grounding metadata
            const candidate = data.candidates?.[0];
            if (!candidate) {
                throw new Error('No response from model');
            }

            const text = candidate.content?.parts
                ?.filter(p => p.text)
                .map(p => p.text)
                .join('\n') || '';

            // Extract grounding metadata
            const groundingMetadata = candidate.groundingMetadata || {};
            const groundingSupport = groundingMetadata.groundingSupports || [];
            const searchQueries = groundingMetadata.retrievalQueries || [];
            const webSearchQueries = groundingMetadata.webSearchQueries || [];

            return {
                success: true,
                text: text,
                grounding: {
                    hasGrounding: groundingSupport.length > 0,
                    supportCount: groundingSupport.length,
                    supports: groundingSupport.map(s => ({
                        segment: s.segment?.text || '',
                        sources: s.groundingChunkIndices?.map(idx =>
                            groundingMetadata.groundingChunks?.[idx]
                        ) || []
                    })),
                    searchQueries: searchQueries,
                    webSearchQueries: webSearchQueries
                },
                metadata: {
                    model: modelName,
                    tokensUsed: data.usageMetadata,
                    finishReason: candidate.finishReason
                }
            };

        } catch (error) {
            console.error('❌ Grounding error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Fact-check a claim using grounding
     */
    async factCheck(claim, options = {}) {
        const prompt = `Fact-check this claim and provide evidence from reliable sources:

CLAIM: "${claim}"

Requirements:
1. Verify accuracy using up-to-date sources
2. Provide supporting evidence with citations
3. Rate confidence level (HIGH/MEDIUM/LOW)
4. Identify any misleading or incorrect parts

Format response as JSON:
{
  "verdict": "TRUE|FALSE|PARTIALLY_TRUE|UNVERIFIABLE",
  "confidence": "HIGH|MEDIUM|LOW",
  "evidence": ["Evidence 1 with [source]", "Evidence 2"],
  "explanation": "Detailed explanation",
  "sources": ["https://source1.com", "https://source2.com"]
}`;

        const result = await this.generateWithGrounding(prompt, {
            ...options,
            dynamicThreshold: 0.2 // Heavy grounding for fact-checking
        });

        if (!result.success) {
            return result;
        }

        try {
            const jsonMatch = result.text.match(/```json\s*([\s\S]*?)\s*```/);
            const parsed = jsonMatch
                ? JSON.parse(jsonMatch[1])
                : JSON.parse(result.text);

            return {
                success: true,
                factCheck: parsed,
                grounding: result.grounding,
                raw: result.text
            };
        } catch (e) {
            return {
                success: true,
                factCheck: null,
                grounding: result.grounding,
                raw: result.text
            };
        }
    }

    /**
     * Generate content with citations
     */
    async generateWithCitations(prompt, options = {}) {
        const enhancedPrompt = `${prompt}

IMPORTANT: For any factual claims, include inline citations using [1], [2] format, and list full sources at the end:

## Sources
1. [Source title] - URL
2. [Source title] - URL`;

        return await this.generateWithGrounding(enhancedPrompt, {
            ...options,
            dynamicThreshold: 0.25 // Moderate grounding
        });
    }

    /**
     * Research a topic with comprehensive grounding
     */
    async researchTopic(topic, options = {}) {
        const prompt = `Conduct comprehensive research on: "${topic}"

Provide:
1. Overview and key concepts
2. Current state-of-the-art (2024-2026)
3. Recent developments and trends
4. Expert opinions and perspectives
5. Statistical data and evidence
6. Full citations for all claims

Use only reliable, recent sources. Format as structured report.`;

        const result = await this.generateWithGrounding(prompt, {
            ...options,
            model: 'pro', // Use Pro for research
            dynamicThreshold: 0.3
        });

        if (!result.success) {
            return result;
        }

        return {
            success: true,
            report: result.text,
            grounding: result.grounding,
            sources: this.extractSources(result.grounding),
            queriesUsed: result.grounding.searchQueries || []
        };
    }

    /**
     * Extract unique sources from grounding metadata
     */
    extractSources(grounding) {
        if (!grounding || !grounding.supports) {
            return [];
        }

        const sources = new Set();

        grounding.supports.forEach(support => {
            if (support.sources) {
                support.sources.forEach(source => {
                    if (source?.uri) {
                        sources.add(source.uri);
                    }
                });
            }
        });

        return Array.from(sources);
    }

    /**
     * Compare information from grounding vs regular generation
     */
    async compareGroundedVsRegular(prompt) {
        console.log('🔬 A/B Test: Grounded vs Regular');

        // Regular generation
        const regularStart = Date.now();
        const regular = await fetch(
            `${this.baseUrl}/models/${this.models.flash}:generateContent?key=${this.apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.5 }
                })
            }
        );
        const regularTime = Date.now() - regularStart;
        const regularData = await regular.json();

        // Grounded generation
        const groundedStart = Date.now();
        const grounded = await this.generateWithGrounding(prompt);
        const groundedTime = Date.now() - groundedStart;

        return {
            regular: {
                text: regularData.candidates?.[0]?.content?.parts?.[0]?.text || '',
                time: regularTime,
                tokens: regularData.usageMetadata
            },
            grounded: {
                text: grounded.text,
                time: groundedTime,
                sources: this.extractSources(grounded.grounding),
                groundingSupport: grounded.grounding.supportCount
            },
            comparison: {
                timeIncrease: `${((groundedTime - regularTime) / regularTime * 100).toFixed(1)}%`,
                sourcesProvided: this.extractSources(grounded.grounding).length,
                groundingUsed: grounded.grounding.hasGrounding
            }
        };
    }
}

module.exports = { GeminiGrounding };
