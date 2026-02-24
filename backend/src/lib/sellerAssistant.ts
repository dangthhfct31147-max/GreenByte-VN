import { z } from 'zod';

const SellerAssistantGuidanceSchema = z.object({
    assistant_message: z.string().min(1).max(600),
    normalized_description: z.string().max(1200),
    quality_standards: z.array(z.string().min(1).max(180)).max(6),
    missing_fields: z.array(z.string().min(1).max(80)).max(8),
    warnings: z.array(z.string().min(1).max(180)).max(8),
    suggested_title: z.string().max(200).optional(),
});

export type SellerAssistantGuidance = z.infer<typeof SellerAssistantGuidanceSchema>;

type ConversationTurn = {
    role: 'user' | 'assistant';
    content: string;
};

type SellerDraftInput = {
    title?: string;
    price?: number;
    quality_score?: number;
    unit?: string;
    category?: string;
    location?: string;
    image?: string;
    description?: string;
    co2_savings_kg?: number;
};

type SellerAssistantInput = {
    message: string;
    draft?: SellerDraftInput;
    conversation?: ConversationTurn[];
};

type SellerAssistantOutput = {
    guidance: SellerAssistantGuidance;
    provider: 'openai-compatible' | 'heuristic';
    model: string;
};

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

function buildMissingFields(draft?: SellerDraftInput): string[] {
    if (!draft) {
        return ['tiêu đề', 'giá bán', 'đơn vị tính', 'danh mục', 'khu vực', 'ảnh sản phẩm', 'mô tả'];
    }

    const missing: string[] = [];

    if (!draft.title?.trim()) missing.push('tiêu đề');
    if (typeof draft.price !== 'number' || draft.price <= 0) missing.push('giá bán');
    if (!draft.unit?.trim()) missing.push('đơn vị tính');
    if (!draft.category?.trim()) missing.push('danh mục');
    if (!draft.location?.trim()) missing.push('khu vực');
    if (!draft.image?.trim()) missing.push('ảnh sản phẩm');
    if (!draft.description?.trim()) missing.push('mô tả');

    return missing;
}

function buildWarnings(draft?: SellerDraftInput): string[] {
    if (!draft) return [];

    const warnings: string[] = [];

    if (draft.description && draft.description.trim().length > 0 && draft.description.trim().length < 30) {
        warnings.push('Mô tả còn ngắn, nên ghi rõ số lượng, độ ẩm, tạp chất và điều kiện vận chuyển.');
    }

    if (typeof draft.quality_score === 'number' && (draft.quality_score < 1 || draft.quality_score > 5)) {
        warnings.push('Điểm chất lượng cần trong khoảng 1-5.');
    }

    if (typeof draft.co2_savings_kg === 'number' && draft.co2_savings_kg <= 0) {
        warnings.push('CO₂ tiết kiệm nên lớn hơn 0 để phản ánh lợi ích môi trường.');
    }

    if (draft.location && draft.location.trim().length < 4) {
        warnings.push('Khu vực quá ngắn, nên ghi rõ quận/huyện và tỉnh để người mua dễ tìm.');
    }

    return warnings;
}

function qualityStandardsByCategory(category?: string): string[] {
    const key = (category ?? '').toLowerCase();

    if (key.includes('rơm') || key.includes('rom')) {
        return [
            'Độ ẩm mục tiêu: dưới 18% để giảm mốc.',
            'Tạp chất đất/cát thấp, hạn chế lẫn nilon.',
            'Bó/cuộn đồng đều, dễ bốc xếp và vận chuyển.',
        ];
    }

    if (key.includes('trấu') || key.includes('trau')) {
        return [
            'Độ ẩm thấp, hạt trấu tơi và không vón cục.',
            'Ít tro bụi, không lẫn rác vô cơ.',
            'Màu sắc đồng đều, không có mùi lạ.',
        ];
    }

    if (key.includes('bã mía') || key.includes('ba mia') || key.includes('bagasse')) {
        return [
            'Độ ẩm cần khai báo rõ theo mục đích sử dụng.',
            'Tỷ lệ xơ đồng đều, ít tạp chất cứng.',
            'Không lẫn bao bì/nhựa trong lô hàng.',
        ];
    }

    if (key.includes('phân') || key.includes('compost')) {
        return [
            'Nêu rõ trạng thái ủ hoai và độ mịn.',
            'Không lẫn tạp chất vô cơ (nilon, kim loại).',
            'Khai báo mùi và độ ẩm để người mua đánh giá nhanh.',
        ];
    }

    return [
        'Khai báo độ ẩm ước tính của lô hàng.',
        'Mô tả mức tạp chất và phương pháp sàng lọc.',
        'Nêu rõ quy cách đóng gói và điều kiện giao nhận.',
    ];
}

function normalizeDescription(draft?: SellerDraftInput): string {
    const title = draft?.title?.trim();
    const category = draft?.category?.trim();
    const unit = draft?.unit?.trim();
    const location = draft?.location?.trim();
    const description = draft?.description?.trim();
    const quality = typeof draft?.quality_score === 'number' ? `${draft.quality_score}/5` : null;

    const segments: string[] = [];

    if (title) segments.push(`Sản phẩm: ${title}.`);
    if (category) segments.push(`Danh mục: ${category}.`);
    if (quality) segments.push(`Mức chất lượng khai báo: ${quality}.`);
    if (description) {
        segments.push(`Mô tả: ${description.replace(/\s+/g, ' ').trim()}.`);
    } else {
        segments.push('Mô tả: Cần bổ sung tình trạng thực tế, độ ẩm, tạp chất và hình thức đóng gói.');
    }

    if (location) {
        segments.push(`Khu vực giao nhận: ${location}.`);
    }

    if (unit) {
        segments.push(`Đơn vị tính: ${unit}.`);
    }

    return segments.join(' ');
}

function buildSuggestedTitle(draft?: SellerDraftInput): string | undefined {
    const base = draft?.title?.trim();
    if (!base) return undefined;

    const category = draft?.category?.trim();
    const location = draft?.location?.trim();

    if (category && !base.toLowerCase().includes(category.toLowerCase())) {
        return `${base} - ${category}`.slice(0, 200);
    }

    if (location && !base.toLowerCase().includes(location.toLowerCase())) {
        return `${base} (${location})`.slice(0, 200);
    }

    return base;
}

function buildHeuristicGuidance(input: SellerAssistantInput): SellerAssistantOutput {
    const missing = buildMissingFields(input.draft);
    const warnings = buildWarnings(input.draft);
    const qualityStandards = qualityStandardsByCategory(input.draft?.category);
    const normalizedDescription = normalizeDescription(input.draft);
    const suggestedTitle = buildSuggestedTitle(input.draft);

    const ask = input.message.trim();
    const hasMissing = missing.length > 0;

    const assistantMessage = hasMissing
        ? `Mình đã xem thông tin bạn nhập. Trước khi đăng, bạn cần bổ sung: ${missing.join(', ')}. Sau đó hãy bấm lại để mình rà soát lần cuối.`
        : `Mình đã chuẩn hóa mô tả theo tiếng Việt dễ hiểu. Bạn có thể áp dụng ngay và đăng tin. Nếu cần, mình sẽ gợi ý viết lại ngắn gọn hơn cho người mua.`;

    const guidance: SellerAssistantGuidance = {
        assistant_message: ask
            ? `${assistantMessage} Câu hỏi của bạn: "${ask.slice(0, 120)}".`
            : assistantMessage,
        normalized_description: normalizedDescription,
        quality_standards: qualityStandards,
        missing_fields: missing,
        warnings,
        suggested_title: suggestedTitle,
    };

    return {
        guidance,
        provider: 'heuristic',
        model: 'seller-assistant-rules-v1',
    };
}

async function callOpenAICompatible(input: SellerAssistantInput): Promise<SellerAssistantOutput | null> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return null;

    const baseUrl = (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const model = process.env.SELLER_ASSISTANT_MODEL?.trim() || process.env.OPENAI_TEXT_MODEL?.trim() || 'gpt-4.1-mini';

    const payload = {
        model,
        temperature: 0.2,
        max_tokens: 700,
        messages: [
            {
                role: 'system',
                content: 'Bạn là trợ lý đăng bán phụ phẩm cho nông hộ Việt Nam. Trả lời tiếng Việt đơn giản, ngắn gọn, dễ hiểu. CHỈ trả về JSON hợp lệ theo schema: {assistant_message, normalized_description, quality_standards, missing_fields, warnings, suggested_title}. Không thêm markdown.',
            },
            ...(input.conversation ?? []).slice(-6).map((turn) => ({
                role: turn.role,
                content: turn.content,
            })),
            {
                role: 'user',
                content: JSON.stringify({
                    task: 'Hướng dẫn nhập thông tin đăng bán, chuẩn hóa mô tả, gợi ý tiêu chuẩn chất lượng, cảnh báo thiếu thông tin',
                    user_message: input.message,
                    draft: input.draft ?? {},
                }),
            },
        ],
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const details = await response.text();
        throw new Error(`Seller assistant API thất bại (${response.status}): ${details.slice(0, 200)}`);
    }

    const data = (await response.json()) as any;
    const content = String(data?.choices?.[0]?.message?.content ?? '').trim();
    if (!content) {
        throw new Error('Seller assistant API không trả về nội dung');
    }

    const parsed = parseJsonObject(content);
    const guidance = SellerAssistantGuidanceSchema.parse(parsed);

    return {
        guidance,
        provider: 'openai-compatible',
        model,
    };
}

export async function generateSellerAssistantGuidance(input: SellerAssistantInput): Promise<SellerAssistantOutput> {
    const normalizedInput: SellerAssistantInput = {
        message: input.message.trim(),
        draft: input.draft,
        conversation: input.conversation?.map((turn) => ({ role: turn.role, content: turn.content.trim() })),
    };

    try {
        const result = await callOpenAICompatible(normalizedInput);
        if (result) return result;
    } catch {
    }

    return buildHeuristicGuidance(normalizedInput);
}
