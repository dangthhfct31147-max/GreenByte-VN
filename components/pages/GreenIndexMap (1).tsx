import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Info, TrendingUp, TrendingDown, MapPin, Loader2, BarChart3 } from 'lucide-react';
import { apiFetch } from '@/utils/api';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ══════════════════════════════════════════════
// GeoJSON CDN sources (fallback chain)
// ══════════════════════════════════════════════
const GEOJSON_URLS = [
    'https://raw.githubusercontent.com/nguyenduy1133/data/refs/heads/main/Dia_phan_Tinh_cap_nhat.geojson',
    'https://code.highcharts.com/mapdata/countries/vn/vn-all.geo.json',
    'https://raw.githubusercontent.com/TungTh/vnm-hcdc-geojson/refs/heads/master/data/diaphantinh.geojson',
];

interface ProvinceData {
    name: string;
    nameEn: string;
    score: number;
    transactions: number;
    events: number;
    newFarms: number;
    violations: number;
    frauds: number;
}

interface Stats {
    total: number;
    averageScore: number;
    greenCount: number;
    yellowCount: number;
    redCount: number;
}

interface GreenIndexMapProps {
    onBack: () => void;
}

// ══════════════════════════════════════════════
// Color scale: Red (<30) → Yellow (30-60) → Green (>60)
// ══════════════════════════════════════════════
function getScoreColor(score: number): string {
    if (score > 60) {
        // Green range: 60–100 → lighter to darker green
        const t = Math.min((score - 60) / 40, 1);
        const g = Math.round(180 + t * 60);
        return `rgb(${Math.round(34 - t * 20)}, ${g}, ${Math.round(60 + t * 20)})`;
    } else if (score >= 30) {
        // Yellow/Orange range: 30–60
        const t = (score - 30) / 30;
        const r = Math.round(239 - t * 100);
        const g = Math.round(100 + t * 80);
        return `rgb(${r}, ${g}, 30)`;
    } else {
        // Red range: 0–30
        const t = score / 30;
        return `rgb(${Math.round(180 + t * 59)}, ${Math.round(30 + t * 38)}, ${Math.round(30 + t * 38)})`;
    }
}

function getScoreLabel(score: number): { text: string; emoji: string } {
    if (score > 60) return { text: 'Tuần hoàn tốt', emoji: '🟢' };
    if (score >= 30) return { text: 'Trung bình', emoji: '🟡' };
    return { text: 'Ô nhiễm cao', emoji: '🔴' };
}

// ══════════════════════════════════════════════
// Try to match GeoJSON feature name to province data
// ══════════════════════════════════════════════
function matchProvince(featureName: string, provinces: ProvinceData[]): ProvinceData | undefined {
    if (!featureName) return undefined;
    const normalized = featureName
        .replace(/^(Tỉnh|Thành phố|TP\.?\s*)/i, '')
        .trim()
        .toLowerCase();

    return provinces.find(p => {
        const pName = p.name.replace(/^(TP\.\s*)/i, '').trim().toLowerCase();
        const pNameEn = p.nameEn.toLowerCase();
        return pName === normalized ||
            pNameEn === normalized ||
            pName.includes(normalized) ||
            normalized.includes(pName) ||
            pNameEn.includes(normalized) ||
            normalized.includes(pNameEn);
    });
}

export function GreenIndexMap({ onBack }: GreenIndexMapProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const [provinces, setProvinces] = useState<ProvinceData[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [selectedProvince, setSelectedProvince] = useState<ProvinceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [geoLoading, setGeoLoading] = useState(true);
    const [showLegend, setShowLegend] = useState(true);
    const [showRanking, setShowRanking] = useState(false);

    // Fetch province scores
    useEffect(() => {
        async function load() {
            try {
                const res = await apiFetch('/api/green-index/provinces');
                if (res.ok) {
                    const data = await res.json();
                    setProvinces(data.provinces);
                    setStats(data.stats);
                }
            } catch { /* ignore */ }
            setLoading(false);
        }
        load();
    }, []);

    // Initialize Leaflet map
    useEffect(() => {
        if (!mapRef.current || mapInstanceRef.current) return;

        const map = L.map(mapRef.current, {
            center: [16.0, 106.0],
            zoom: 6,
            zoomControl: false,
            attributionControl: false,
        });

        // Dark tile layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 18,
        }).addTo(map);

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        mapInstanceRef.current = map;

        return () => {
            map.remove();
            mapInstanceRef.current = null;
        };
    }, []);

    // Load GeoJSON and apply province colors
    useEffect(() => {
        if (!mapInstanceRef.current || provinces.length === 0) return;
        const map = mapInstanceRef.current;

        let cancelled = false;

        async function loadGeoJSON() {
            let geojsonData = null;

            // Try multiple CDN sources with fallback
            for (const url of GEOJSON_URLS) {
                try {
                    const resp = await fetch(url);
                    if (resp.ok) {
                        geojsonData = await resp.json();
                        if (geojsonData?.features?.length > 0) {
                            console.log(`GeoJSON loaded from: ${url} (${geojsonData.features.length} features)`);
                            break;
                        }
                    }
                } catch {
                    console.warn(`Failed to load GeoJSON from: ${url}`);
                }
            }

            if (cancelled) return;

            if (!geojsonData) {
                console.error('All GeoJSON sources failed');
                setGeoLoading(false);
                return;
            }

            // Create the choropleth layer
            L.geoJSON(geojsonData, {
                style: (feature) => {
                    const name = feature?.properties?.ten_tinh
                        || feature?.properties?.name
                        || feature?.properties?.NAME_1
                        || feature?.properties?.shapeName
                        || '';
                    const province = matchProvince(name, provinces);
                    const score = province?.score ?? 50;

                    return {
                        fillColor: getScoreColor(score),
                        fillOpacity: 0.7,
                        color: '#1e293b',
                        weight: 1.5,
                        opacity: 0.8,
                    };
                },
                onEachFeature: (feature, layer) => {
                    const name = feature?.properties?.ten_tinh
                        || feature?.properties?.name
                        || feature?.properties?.NAME_1
                        || feature?.properties?.shapeName
                        || 'Không rõ';
                    const province = matchProvince(name, provinces);
                    const score = province?.score ?? 50;
                    const label = getScoreLabel(score);

                    // Tooltip on hover
                    layer.bindTooltip(
                        `<div style="text-align:center;font-family:sans-serif;">
                            <div style="font-weight:700;font-size:13px;">${province?.name || name}</div>
                            <div style="font-size:20px;margin:4px 0;">${label.emoji} ${score}</div>
                            <div style="font-size:11px;color:#94a3b8;">${label.text}</div>
                        </div>`,
                        { sticky: true, className: 'green-index-tooltip' },
                    );

                    // Click for detail
                    layer.on('click', () => {
                        if (province) setSelectedProvince(province);
                    });

                    // Hover effects
                    layer.on('mouseover', () => {
                        (layer as any).setStyle({ fillOpacity: 0.9, weight: 3, color: '#fff' });
                    });
                    layer.on('mouseout', () => {
                        (layer as any).setStyle({ fillOpacity: 0.7, weight: 1.5, color: '#1e293b' });
                    });
                },
            }).addTo(map);

            setGeoLoading(false);
        }

        loadGeoJSON();

        return () => { cancelled = true; };
    }, [provinces]);

    const rankings = [...provinces].sort((a, b) => b.score - a.score);

    return (
        <div className="relative w-full" style={{ height: 'calc(100vh - 64px)' }}>
            {/* Map Container */}
            <div ref={mapRef} className="absolute inset-0 z-0" />

            {/* Custom tooltip style */}
            <style>{`
                .green-index-tooltip {
                    background: rgba(15,23,42,0.95) !important;
                    border: 1px solid rgba(100,116,139,0.3) !important;
                    border-radius: 12px !important;
                    padding: 8px 14px !important;
                    color: #fff !important;
                    backdrop-filter: blur(8px);
                    box-shadow: 0 8px 32px rgba(0,0,0,0.4) !important;
                }
                .green-index-tooltip::before { display: none !important; }
                .leaflet-tooltip-top:before, .leaflet-tooltip-bottom:before,
                .leaflet-tooltip-left:before, .leaflet-tooltip-right:before {
                    border: none !important;
                }
            `}</style>

            {/* Loading overlay */}
            {(loading || geoLoading) && (
                <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: 'rgba(15,23,42,0.8)' }}>
                    <div className="text-center text-white">
                        <Loader2 size={32} className="animate-spin mx-auto mb-3" />
                        <div className="text-sm font-medium">{loading ? 'Đang tải dữ liệu...' : 'Đang vẽ bản đồ...'}</div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="absolute top-4 left-4 z-10 flex items-center gap-3">
                <button onClick={onBack} className="w-10 h-10 rounded-full flex items-center justify-center text-white" style={{ background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(100,116,139,0.3)' }}>
                    <ArrowLeft size={18} />
                </button>
                <div className="px-4 py-2 rounded-xl" style={{ background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(100,116,139,0.3)' }}>
                    <h1 className="text-base font-bold text-white flex items-center gap-2">
                        🗺️ Chỉ Số Xanh Tỉnh Thành
                    </h1>
                    <p className="text-xs text-gray-400">Green Index — 63 tỉnh thành Việt Nam</p>
                </div>
            </div>

            {/* Summary Cards */}
            {stats && (
                <div className="absolute top-4 right-4 z-10 flex flex-col gap-2" style={{ maxWidth: '200px' }}>
                    <div className="rounded-xl px-3 py-2 text-center" style={{ background: 'rgba(15,23,42,0.9)', backdropFilter: 'blur(8px)', border: '1px solid rgba(34,197,94,0.3)' }}>
                        <div className="text-2xl font-black text-emerald-400">{stats.averageScore}</div>
                        <div className="text-xs text-gray-400">Điểm TB cả nước</div>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                        <div className="rounded-lg px-1 py-1.5 text-center" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}>
                            <div className="text-sm font-bold text-green-400">{stats.greenCount}</div>
                            <div className="text-[9px] text-gray-400">Xanh</div>
                        </div>
                        <div className="rounded-lg px-1 py-1.5 text-center" style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)' }}>
                            <div className="text-sm font-bold text-yellow-400">{stats.yellowCount}</div>
                            <div className="text-[9px] text-gray-400">Vàng</div>
                        </div>
                        <div className="rounded-lg px-1 py-1.5 text-center" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                            <div className="text-sm font-bold text-red-400">{stats.redCount}</div>
                            <div className="text-[9px] text-gray-400">Đỏ</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Color Legend */}
            <div className="absolute bottom-6 left-4 z-10">
                <button onClick={() => setShowLegend(p => !p)} className="mb-2 w-8 h-8 rounded-full flex items-center justify-center text-white" style={{ background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(100,116,139,0.3)' }}>
                    <Info size={16} />
                </button>
                {showLegend && (
                    <div className="rounded-xl p-3" style={{ background: 'rgba(15,23,42,0.92)', backdropFilter: 'blur(8px)', border: '1px solid rgba(100,116,139,0.3)', minWidth: '180px' }}>
                        <div className="text-xs font-bold text-white mb-2">Thang màu Green Index</div>
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-3 rounded-sm" style={{ background: '#22c55e' }} />
                                <span className="text-xs text-gray-300">&gt; 60: Tuần hoàn tốt</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-3 rounded-sm" style={{ background: '#f59e0b' }} />
                                <span className="text-xs text-gray-300">30–60: Trung bình</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-3 rounded-sm" style={{ background: '#ef4444' }} />
                                <span className="text-xs text-gray-300">&lt; 30: Ô nhiễm cao</span>
                            </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-slate-700/50">
                            <div className="text-[10px] text-gray-500 space-y-0.5">
                                <div>🤝 Giao dịch thành công: +2</div>
                                <div>📦 Sự kiện thu gom: +5</div>
                                <div>🌾 Nông hộ mới: +1</div>
                                <div>🔥 Đốt rơm/vứt bãi: -5</div>
                                <div>⚠️ Gian lận chất lượng: -2</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Ranking Toggle */}
            <div className="absolute bottom-6 right-4 z-10">
                <button onClick={() => setShowRanking(p => !p)} className="w-10 h-10 rounded-full flex items-center justify-center text-white" style={{ background: showRanking ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(15,23,42,0.85)', border: '1px solid rgba(100,116,139,0.3)' }}>
                    <BarChart3 size={18} />
                </button>
            </div>

            {/* Ranking Panel */}
            {showRanking && (
                <div className="absolute bottom-20 right-4 z-10 w-72 max-h-[60vh] overflow-y-auto rounded-xl" style={{ background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(12px)', border: '1px solid rgba(100,116,139,0.3)' }}>
                    <div className="sticky top-0 px-4 py-3 font-bold text-sm text-white flex items-center gap-2" style={{ background: 'rgba(15,23,42,0.98)', borderBottom: '1px solid rgba(100,116,139,0.2)' }}>
                        <BarChart3 size={14} className="text-emerald-400" /> Xếp hạng tỉnh thành
                    </div>
                    {rankings.map((p, i) => {
                        const label = getScoreLabel(p.score);
                        return (
                            <button key={p.name} onClick={() => { setSelectedProvince(p); setShowRanking(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-800/50 transition-colors" style={{ borderBottom: '1px solid rgba(51,65,85,0.2)' }}>
                                <span className="text-xs text-gray-500 w-5 text-right font-mono">{i + 1}</span>
                                <span className="text-sm text-white flex-1 truncate">{p.name}</span>
                                <span className="text-xs font-bold" style={{ color: getScoreColor(p.score) }}>{label.emoji} {p.score}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Province Detail Panel */}
            {selectedProvince && (
                <div className="absolute top-1/2 left-1/2 z-30 -translate-x-1/2 -translate-y-1/2 w-[340px] rounded-2xl p-5" style={{ background: 'rgba(15,23,42,0.96)', backdropFilter: 'blur(16px)', border: `2px solid ${getScoreColor(selectedProvince.score)}44`, boxShadow: `0 0 40px ${getScoreColor(selectedProvince.score)}22` }}>
                    <button onClick={() => setSelectedProvince(null)} className="absolute top-3 right-3 text-gray-400 hover:text-white text-lg">✕</button>

                    <div className="text-center mb-4">
                        <div className="flex items-center justify-center gap-2 mb-1">
                            <MapPin size={16} style={{ color: getScoreColor(selectedProvince.score) }} />
                            <h3 className="text-lg font-bold text-white">{selectedProvince.name}</h3>
                        </div>
                        <div className="text-4xl font-black my-2" style={{ color: getScoreColor(selectedProvince.score) }}>
                            {selectedProvince.score}
                        </div>
                        <div className="text-sm" style={{ color: getScoreColor(selectedProvince.score) }}>
                            {getScoreLabel(selectedProvince.score).emoji} {getScoreLabel(selectedProvince.score).text}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Chi tiết điểm</div>

                        <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'rgba(34,197,94,0.1)' }}>
                            <span className="text-xs text-gray-300 flex items-center gap-1.5"><TrendingUp size={12} className="text-green-400" /> Giao dịch thành công</span>
                            <span className="text-xs font-bold text-green-400">+{selectedProvince.transactions * 2} ({selectedProvince.transactions}x)</span>
                        </div>

                        <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'rgba(34,197,94,0.1)' }}>
                            <span className="text-xs text-gray-300 flex items-center gap-1.5"><TrendingUp size={12} className="text-green-400" /> Sự kiện thu gom</span>
                            <span className="text-xs font-bold text-green-400">+{selectedProvince.events * 5} ({selectedProvince.events}x)</span>
                        </div>

                        <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'rgba(34,197,94,0.1)' }}>
                            <span className="text-xs text-gray-300 flex items-center gap-1.5"><TrendingUp size={12} className="text-green-400" /> Nông hộ mới</span>
                            <span className="text-xs font-bold text-green-400">+{selectedProvince.newFarms} ({selectedProvince.newFarms}x)</span>
                        </div>

                        <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)' }}>
                            <span className="text-xs text-gray-300 flex items-center gap-1.5"><TrendingDown size={12} className="text-red-400" /> Vi phạm đốt/vứt</span>
                            <span className="text-xs font-bold text-red-400">-{selectedProvince.violations * 5} ({selectedProvince.violations}x)</span>
                        </div>

                        <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)' }}>
                            <span className="text-xs text-gray-300 flex items-center gap-1.5"><TrendingDown size={12} className="text-red-400" /> Gian lận chất lượng</span>
                            <span className="text-xs font-bold text-red-400">-{selectedProvince.frauds * 2} ({selectedProvince.frauds}x)</span>
                        </div>

                        {/* Score bar */}
                        <div className="mt-3 pt-3 border-t border-slate-700/50">
                            <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                                <span>0</span><span>30</span><span>60</span><span>100</span>
                            </div>
                            <div className="h-3 rounded-full overflow-hidden" style={{ background: 'linear-gradient(90deg, #ef4444 0%, #ef4444 30%, #f59e0b 30%, #f59e0b 60%, #22c55e 60%, #22c55e 100%)' }}>
                                <div className="relative h-full">
                                    <div className="absolute top-0 h-full w-1 bg-white rounded shadow" style={{ left: `${selectedProvince.score}%`, transform: 'translateX(-50%)' }} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
