import { Router } from 'express';

export const greenIndexRouter = Router();

// ══════════════════════════════════════════════
// Dữ liệu mẫu: 63 tỉnh thành, mỗi tỉnh bắt đầu 50 điểm
// Một số tỉnh đã +/- điểm để demo hiệu ứng bản đồ
// ══════════════════════════════════════════════

interface ProvinceScore {
    name: string;           // Tên Vietnamese
    nameEn: string;         // Tên English (dùng match GeoJSON)
    score: number;          // Điểm Green Index
    transactions: number;   // Giao dịch phụ phẩm thành công
    events: number;         // Sự kiện thu gom
    newFarms: number;       // Nông hộ mới đăng ký
    violations: number;     // Báo cáo vi phạm
    frauds: number;         // Giao dịch gian lận
}

const SAMPLE_DATA: ProvinceScore[] = [
    // === ĐÔNG BẰNG SÔNG CỬU LONG (Green - nhiều phụ phẩm nông nghiệp) ===
    { name: 'An Giang', nameEn: 'An Giang', score: 72, transactions: 45, events: 8, newFarms: 35, violations: 1, frauds: 0 },
    { name: 'Bạc Liêu', nameEn: 'Bạc Liêu', score: 65, transactions: 30, events: 5, newFarms: 20, violations: 2, frauds: 0 },
    { name: 'Bến Tre', nameEn: 'Bến Tre', score: 78, transactions: 55, events: 12, newFarms: 40, violations: 0, frauds: 0 },
    { name: 'Cà Mau', nameEn: 'Cà Mau', score: 58, transactions: 20, events: 3, newFarms: 15, violations: 3, frauds: 1 },
    { name: 'Cần Thơ', nameEn: 'Cần Thơ', score: 82, transactions: 60, events: 15, newFarms: 50, violations: 0, frauds: 0 },
    { name: 'Đồng Tháp', nameEn: 'Đồng Tháp', score: 75, transactions: 50, events: 10, newFarms: 38, violations: 1, frauds: 0 },
    { name: 'Hậu Giang', nameEn: 'Hậu Giang', score: 68, transactions: 35, events: 6, newFarms: 25, violations: 1, frauds: 0 },
    { name: 'Kiên Giang', nameEn: 'Kiên Giang', score: 63, transactions: 28, events: 5, newFarms: 22, violations: 2, frauds: 1 },
    { name: 'Long An', nameEn: 'Long An', score: 61, transactions: 25, events: 4, newFarms: 18, violations: 2, frauds: 1 },
    { name: 'Sóc Trăng', nameEn: 'Sóc Trăng', score: 66, transactions: 32, events: 7, newFarms: 28, violations: 1, frauds: 0 },
    { name: 'Tiền Giang', nameEn: 'Tiền Giang', score: 70, transactions: 42, events: 8, newFarms: 30, violations: 1, frauds: 0 },
    { name: 'Trà Vinh', nameEn: 'Trà Vinh', score: 62, transactions: 26, events: 5, newFarms: 20, violations: 2, frauds: 0 },
    { name: 'Vĩnh Long', nameEn: 'Vĩnh Long', score: 69, transactions: 38, events: 7, newFarms: 27, violations: 1, frauds: 0 },

    // === TÂY NGUYÊN (Moderate) ===
    { name: 'Đắk Lắk', nameEn: 'Đắk Lắk', score: 55, transactions: 18, events: 3, newFarms: 12, violations: 3, frauds: 1 },
    { name: 'Đắk Nông', nameEn: 'Đắk Nông', score: 48, transactions: 12, events: 2, newFarms: 8, violations: 4, frauds: 2 },
    { name: 'Gia Lai', nameEn: 'Gia Lai', score: 52, transactions: 15, events: 3, newFarms: 10, violations: 3, frauds: 1 },
    { name: 'Kon Tum', nameEn: 'Kon Tum', score: 45, transactions: 10, events: 1, newFarms: 6, violations: 4, frauds: 2 },
    { name: 'Lâm Đồng', nameEn: 'Lâm Đồng', score: 64, transactions: 30, events: 6, newFarms: 22, violations: 1, frauds: 0 },

    // === ĐÔNG NAM BỘ ===
    { name: 'Bà Rịa - Vũng Tàu', nameEn: 'Bà Rịa-Vũng Tàu', score: 56, transactions: 20, events: 3, newFarms: 14, violations: 3, frauds: 1 },
    { name: 'Bình Dương', nameEn: 'Bình Dương', score: 42, transactions: 8, events: 1, newFarms: 5, violations: 6, frauds: 3 },
    { name: 'Bình Phước', nameEn: 'Bình Phước', score: 53, transactions: 16, events: 2, newFarms: 10, violations: 3, frauds: 1 },
    { name: 'Đồng Nai', nameEn: 'Đồng Nai', score: 47, transactions: 12, events: 2, newFarms: 8, violations: 5, frauds: 2 },
    { name: 'Tây Ninh', nameEn: 'Tây Ninh', score: 57, transactions: 22, events: 4, newFarms: 15, violations: 2, frauds: 1 },
    { name: 'TP. Hồ Chí Minh', nameEn: 'Hồ Chí Minh city', score: 35, transactions: 5, events: 2, newFarms: 3, violations: 8, frauds: 4 },

    // === DUYÊN HẢI NAM TRUNG BỘ ===
    { name: 'Bình Định', nameEn: 'Bình Định', score: 60, transactions: 24, events: 5, newFarms: 18, violations: 2, frauds: 0 },
    { name: 'Bình Thuận', nameEn: 'Bình Thuận', score: 54, transactions: 17, events: 3, newFarms: 12, violations: 3, frauds: 1 },
    { name: 'Đà Nẵng', nameEn: 'Đà Nẵng', score: 50, transactions: 14, events: 3, newFarms: 10, violations: 3, frauds: 1 },
    { name: 'Khánh Hòa', nameEn: 'Khánh Hòa', score: 58, transactions: 22, events: 4, newFarms: 16, violations: 2, frauds: 1 },
    { name: 'Ninh Thuận', nameEn: 'Ninh Thuận', score: 46, transactions: 10, events: 2, newFarms: 7, violations: 4, frauds: 2 },
    { name: 'Phú Yên', nameEn: 'Phú Yên', score: 55, transactions: 18, events: 3, newFarms: 12, violations: 3, frauds: 1 },
    { name: 'Quảng Nam', nameEn: 'Quảng Nam', score: 59, transactions: 23, events: 5, newFarms: 16, violations: 2, frauds: 0 },
    { name: 'Quảng Ngãi', nameEn: 'Quảng Ngãi', score: 52, transactions: 15, events: 3, newFarms: 10, violations: 3, frauds: 1 },

    // === BẮC TRUNG BỘ ===
    { name: 'Hà Tĩnh', nameEn: 'Hà Tĩnh', score: 56, transactions: 20, events: 4, newFarms: 14, violations: 3, frauds: 1 },
    { name: 'Nghệ An', nameEn: 'Nghệ An', score: 61, transactions: 25, events: 5, newFarms: 19, violations: 2, frauds: 0 },
    { name: 'Quảng Bình', nameEn: 'Quảng Bình', score: 50, transactions: 14, events: 2, newFarms: 10, violations: 4, frauds: 1 },
    { name: 'Quảng Trị', nameEn: 'Quảng Trị', score: 47, transactions: 11, events: 2, newFarms: 8, violations: 4, frauds: 2 },
    { name: 'Thanh Hóa', nameEn: 'Thanh Hóa', score: 63, transactions: 28, events: 6, newFarms: 22, violations: 2, frauds: 0 },
    { name: 'Thừa Thiên Huế', nameEn: 'Thừa Thiên-Huế', score: 53, transactions: 16, events: 3, newFarms: 11, violations: 3, frauds: 1 },

    // === ĐỒNG BẰNG SÔNG HỒNG ===
    { name: 'Bắc Ninh', nameEn: 'Bắc Ninh', score: 44, transactions: 9, events: 1, newFarms: 6, violations: 5, frauds: 3 },
    { name: 'Hà Nam', nameEn: 'Hà Nam', score: 55, transactions: 18, events: 3, newFarms: 12, violations: 3, frauds: 1 },
    { name: 'Hà Nội', nameEn: 'Hà Nội', score: 38, transactions: 6, events: 2, newFarms: 4, violations: 7, frauds: 3 },
    { name: 'Hải Dương', nameEn: 'Hải Dương', score: 51, transactions: 14, events: 3, newFarms: 10, violations: 3, frauds: 1 },
    { name: 'Hải Phòng', nameEn: 'Hải Phòng', score: 40, transactions: 7, events: 1, newFarms: 5, violations: 6, frauds: 3 },
    { name: 'Hưng Yên', nameEn: 'Hưng Yên', score: 54, transactions: 17, events: 3, newFarms: 11, violations: 3, frauds: 1 },
    { name: 'Nam Định', nameEn: 'Nam Định', score: 60, transactions: 24, events: 5, newFarms: 18, violations: 2, frauds: 0 },
    { name: 'Ninh Bình', nameEn: 'Ninh Bình', score: 57, transactions: 21, events: 4, newFarms: 15, violations: 2, frauds: 1 },
    { name: 'Thái Bình', nameEn: 'Thái Bình', score: 67, transactions: 34, events: 7, newFarms: 26, violations: 1, frauds: 0 },
    { name: 'Vĩnh Phúc', nameEn: 'Vĩnh Phúc', score: 50, transactions: 14, events: 2, newFarms: 9, violations: 3, frauds: 1 },

    // === ĐÔNG BẮC ===
    { name: 'Bắc Giang', nameEn: 'Bắc Giang', score: 58, transactions: 22, events: 4, newFarms: 16, violations: 2, frauds: 1 },
    { name: 'Bắc Kạn', nameEn: 'Bắc Kạn', score: 43, transactions: 8, events: 1, newFarms: 5, violations: 5, frauds: 2 },
    { name: 'Cao Bằng', nameEn: 'Cao Bằng', score: 40, transactions: 7, events: 1, newFarms: 4, violations: 5, frauds: 3 },
    { name: 'Lạng Sơn', nameEn: 'Lạng Sơn', score: 45, transactions: 10, events: 2, newFarms: 7, violations: 4, frauds: 2 },
    { name: 'Phú Thọ', nameEn: 'Phú Thọ', score: 53, transactions: 16, events: 3, newFarms: 11, violations: 3, frauds: 1 },
    { name: 'Quảng Ninh', nameEn: 'Quảng Ninh', score: 48, transactions: 12, events: 2, newFarms: 8, violations: 4, frauds: 2 },
    { name: 'Thái Nguyên', nameEn: 'Thái Nguyên', score: 56, transactions: 20, events: 4, newFarms: 14, violations: 2, frauds: 1 },
    { name: 'Tuyên Quang', nameEn: 'Tuyên Quang', score: 49, transactions: 13, events: 2, newFarms: 9, violations: 4, frauds: 1 },

    // === TÂY BẮC ===
    { name: 'Điện Biên', nameEn: 'Điện Biên', score: 35, transactions: 5, events: 1, newFarms: 3, violations: 6, frauds: 3 },
    { name: 'Hà Giang', nameEn: 'Hà Giang', score: 42, transactions: 8, events: 1, newFarms: 5, violations: 5, frauds: 2 },
    { name: 'Hòa Bình', nameEn: 'Hòa Bình', score: 50, transactions: 14, events: 2, newFarms: 9, violations: 3, frauds: 2 },
    { name: 'Lai Châu', nameEn: 'Lai Châu', score: 28, transactions: 3, events: 0, newFarms: 2, violations: 7, frauds: 4 },
    { name: 'Lào Cai', nameEn: 'Lào Cai', score: 46, transactions: 10, events: 2, newFarms: 7, violations: 4, frauds: 2 },
    { name: 'Sơn La', nameEn: 'Sơn La', score: 38, transactions: 6, events: 1, newFarms: 4, violations: 6, frauds: 3 },
    { name: 'Yên Bái', nameEn: 'Yên Bái', score: 47, transactions: 11, events: 2, newFarms: 8, violations: 4, frauds: 2 },
];

/**
 * GET /api/green-index/provinces
 * Trả về điểm Green Index cho 63 tỉnh thành.
 */
greenIndexRouter.get('/provinces', (_req, res) => {
    // Xếp hạng theo score giảm dần
    const sorted = [...SAMPLE_DATA].sort((a, b) => b.score - a.score);

    // Thống kê tổng
    const totalScore = SAMPLE_DATA.reduce((sum, p) => sum + p.score, 0);
    const avgScore = Math.round(totalScore / SAMPLE_DATA.length);
    const greenCount = SAMPLE_DATA.filter(p => p.score > 60).length;
    const yellowCount = SAMPLE_DATA.filter(p => p.score >= 30 && p.score <= 60).length;
    const redCount = SAMPLE_DATA.filter(p => p.score < 30).length;

    res.json({
        provinces: SAMPLE_DATA,
        rankings: sorted.map((p, i) => ({ rank: i + 1, ...p })),
        stats: {
            total: SAMPLE_DATA.length,
            averageScore: avgScore,
            greenCount,     // > 60
            yellowCount,    // 30–60
            redCount,       // < 30
        },
    });
});

/**
 * GET /api/green-index/province/:name
 * Lấy chi tiết một tỉnh.
 */
greenIndexRouter.get('/province/:name', (req, res) => {
    const name = decodeURIComponent(req.params.name);
    const province = SAMPLE_DATA.find(
        p => p.name.toLowerCase() === name.toLowerCase() ||
            p.nameEn.toLowerCase() === name.toLowerCase(),
    );

    if (!province) {
        return res.status(404).json({ error: 'Không tìm thấy tỉnh' });
    }

    // Tính toán breakdown
    const bonusFromTransactions = province.transactions * 2;
    const bonusFromEvents = province.events * 5;
    const bonusFromFarms = province.newFarms * 1;
    const penaltyFromViolations = province.violations * 5;
    const penaltyFromFrauds = province.frauds * 2;

    return res.json({
        province: {
            ...province,
            breakdown: {
                baseScore: 50,
                bonusFromTransactions,
                bonusFromEvents,
                bonusFromFarms,
                penaltyFromViolations,
                penaltyFromFrauds,
                calculatedScore: 50 + bonusFromTransactions + bonusFromEvents + bonusFromFarms - penaltyFromViolations - penaltyFromFrauds,
            },
            colorLevel: province.score > 60 ? 'green' : province.score >= 30 ? 'yellow' : 'red',
        },
    });
});

/**
 * GET /api/green-index/scoring-rules
 * Quy tắc chấm điểm (hiển thị trên UI).
 */
greenIndexRouter.get('/scoring-rules', (_req, res) => {
    res.json({
        baseScore: 50,
        bonusRules: [
            { action: 'Giao dịch phụ phẩm thành công', points: '+2', icon: '🤝' },
            { action: 'Tổ chức sự kiện thu gom/tập huấn', points: '+5', icon: '📦' },
            { action: 'Nông hộ mới đăng ký tham gia', points: '+1', icon: '🌾' },
        ],
        penaltyRules: [
            { action: 'Báo cáo đốt rơm rạ/vứt bừa bãi (admin duyệt)', points: '-5', icon: '🔥' },
            { action: 'Giao dịch bị hủy do gian lận chất lượng', points: '-2', icon: '⚠️' },
        ],
        colorScale: [
            { range: '< 30 điểm', color: '#ef4444', label: 'Đỏ - Ô nhiễm cao' },
            { range: '30 – 60 điểm', color: '#f59e0b', label: 'Vàng/Cam - Trung bình' },
            { range: '> 60 điểm', color: '#22c55e', label: 'Xanh lá - Tuần hoàn tốt' },
        ],
    });
});
