import { z } from 'zod';

const SuggestionSchema = z.object({
    category: z.enum(['Rơm rạ', 'Vỏ trấu', 'Phân bón', 'Bã mía', 'Gỗ & Mùn cưa', 'Khác']),
    moisture_state: z.enum(['KHÔ', 'ẨM', 'ƯỚT', 'KHÔNG_RÕ']),
    impurity_level: z.enum(['THẤP', 'TRUNG_BÌNH', 'CAO', 'KHÔNG_RÕ']),
    confidence: z.number().min(0).max(1),
    recommended_quality_score: z.number().int().min(1).max(5),
    summary: z.string().max(300),
    evidence: z.array(z.string().max(120)).max(4),
});

export type ByproductVisionSuggestion = z.infer<typeof SuggestionSchema>;

type ClassifyInput = {
    imageUrl: string;
    title?: string;
    description?: string;
};

type ClassifyOutput = {
    suggestion: ByproductVisionSuggestion;
    provider: 'openai-compatible' | 'heuristic';
    model: string;
};

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function buildHeuristicSuggestion(input: ClassifyInput): ByproductVisionSuggestion {
    const source = `${input.imageUrl} ${input.title ?? ''} ${input.description ?? ''}`.toLowerCase();

    let category: ByproductVisionSuggestion['category'] = 'Khác';
    const categoryEvidence: string[] = [];

    if (/(rơm|rom|straw|straw-bale|rice-straw)/i.test(source)) {
        category = 'Rơm rạ';
        categoryEvidence.push('Từ khóa gợi ý: rơm/straw');
    } else if (/(trấu|trau|husk|rice-husk)/i.test(source)) {
        category = 'Vỏ trấu';
        categoryEvidence.push('Từ khóa gợi ý: trấu/husk');
    } else if (/(bã mía|ba mia|bagasse|sugarcane)/i.test(source)) {
        category = 'Bã mía';
        categoryEvidence.push('Từ khóa gợi ý: bã mía/bagasse');
    } else if (/(mùn cưa|mun cua|sawdust|woodchip|go\b|gỗ)/i.test(source)) {
        category = 'Gỗ & Mùn cưa';
        categoryEvidence.push('Từ khóa gợi ý: mùn cưa/sawdust');
    } else if (/(phân|phan|compost|fertiliz|organic-manure)/i.test(source)) {
        category = 'Phân bón';
        categoryEvidence.push('Từ khóa gợi ý: phân/compost');
    }

    let moisture_state: ByproductVisionSuggestion['moisture_state'] = 'KHÔNG_RÕ';
    if (/(ướt|uot|wet|muddy|slurry)/i.test(source)) moisture_state = 'ƯỚT';
    else if (/(ẩm|am\b|moist|damp)/i.test(source)) moisture_state = 'ẨM';
    else if (/(khô|kho\b|dry)/i.test(source)) moisture_state = 'KHÔ';

    let impurity_level: ByproductVisionSuggestion['impurity_level'] = 'KHÔNG_RÕ';
    if (/(sạch|sach|clean|sorted|uniform)/i.test(source)) impurity_level = 'THẤP';
    else if (/(lẫn|tap chat|tạp chất|bụi|bui|mixed|contamin)/i.test(source)) impurity_level = 'TRUNG_BÌNH';
    if (/(nhiều tạp|high impurity|dirty|mud|soil|rác|rac)/i.test(source)) impurity_level = 'CAO';

    let confidence = 0.55;
    if (category !== 'Khác') confidence += 0.12;
    if (moisture_state !== 'KHÔNG_RÕ') confidence += 0.08;
    if (impurity_level !== 'KHÔNG_RÕ') confidence += 0.08;

    let quality = 4;
    if (moisture_state === 'ẨM') quality -= 1;
    if (moisture_state === 'ƯỚT') quality -= 2;
    if (impurity_level === 'TRUNG_BÌNH') quality -= 1;
    if (impurity_level === 'CAO') quality -= 2;
    quality = clamp(quality, 1, 5);

    const evidence = [
        ...categoryEvidence,
        moisture_state !== 'KHÔNG_RÕ' ? `Trạng thái ẩm: ${moisture_state}` : 'Độ ẩm: chưa đủ tín hiệu',
        impurity_level !== 'KHÔNG_RÕ' ? `Mức tạp chất: ${impurity_level}` : 'Tạp chất: chưa đủ tín hiệu',
    ].slice(0, 4);

    return {
        category,
        moisture_state,
        impurity_level,
        confidence: Number(clamp(confidence, 0.35, 0.9).toFixed(2)),
        recommended_quality_score: quality,
        summary: `Gợi ý AI: ${category}, trạng thái ${moisture_state.toLowerCase()}, tạp chất ${impurity_level.toLowerCase()}.`,
        evidence,
    };
}

function parseJsonObject(content: string): unknown {
    try {
        return JSON.parse(content);
    } catch {
        const matched = content.match(/\{[\s\S]*\}/);
        if (!matched) {
            throw new Error('Không parse được JSON từ phản hồi AI');
        }
        return JSON.parse(matched[0]);
    }
}

async function classifyWithOpenAICompatible(input: ClassifyInput): Promise<ClassifyOutput | null> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return null;

    const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const model = process.env.BYPRODUCT_VISION_MODEL?.trim() || process.env.OPENAI_VISION_MODEL?.trim() || 'gpt-4.1-mini';

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            temperature: 0.1,
            max_tokens: 260,
            messages: [
                {
                    role: 'system',
                    content:
                        'Bạn là hệ thống thị giác máy tính cho sàn phụ phẩm nông nghiệp. Chỉ trả về JSON hợp lệ theo schema: {category, moisture_state, impurity_level, confidence, recommended_quality_score, summary, evidence}. category chỉ được chọn một trong: Rơm rạ, Vỏ trấu, Phân bón, Bã mía, Gỗ & Mùn cưa, Khác. moisture_state: KHÔ|ẨM|ƯỚT|KHÔNG_RÕ. impurity_level: THẤP|TRUNG_BÌNH|CAO|KHÔNG_RÕ. confidence 0..1.',
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: `Hãy phân loại phụ phẩm từ ảnh và metadata. title=${input.title ?? ''}; description=${input.description ?? ''}`,
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: input.imageUrl,
                            },
                        },
                    ],
                },
            ],
        }),
    });

    if (!response.ok) {
        const details = await response.text();
        throw new Error(`AI vision API thất bại (${response.status}): ${details.slice(0, 200)}`);
    }

    const payload = (await response.json()) as any;
    const content = String(payload?.choices?.[0]?.message?.content ?? '').trim();
    if (!content) {
        throw new Error('AI vision API không trả về nội dung');
    }

    const parsed = parseJsonObject(content);
    const suggestion = SuggestionSchema.parse(parsed);

    return {
        suggestion,
        provider: 'openai-compatible',
        model,
    };
}

export async function classifyByproductFromImage(input: ClassifyInput): Promise<ClassifyOutput> {
    const trimmed: ClassifyInput = {
        imageUrl: input.imageUrl.trim(),
        title: input.title?.trim(),
        description: input.description?.trim(),
    };

    try {
        const ai = await classifyWithOpenAICompatible(trimmed);
        if (ai) return ai;
    } catch {
        // silently fall back to heuristic model to keep UX responsive
    }

    return {
        suggestion: buildHeuristicSuggestion(trimmed),
        provider: 'heuristic',
        model: 'keyword-rules-v1',
    };
}
