import React from 'react';
import { ArrowLeft, Info, BarChart3 } from 'lucide-react';

interface GreenIndexMapProps {
    onBack: () => void;
}

export function GreenIndexMap({ onBack }: GreenIndexMapProps) {
    return (
        <div className="relative h-[calc(100vh-64px)] w-full bg-slate-900">
            <div className="absolute left-4 top-4 z-10 flex items-center gap-3">
                <button
                    onClick={onBack}
                    title="Quay lại"
                    aria-label="Quay lại"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-500/30 bg-slate-900/85 text-white"
                >
                    <ArrowLeft size={18} />
                </button>
                <div className="rounded-xl border border-slate-500/30 bg-slate-900/85 px-4 py-2 backdrop-blur">
                    <h1 className="flex items-center gap-2 text-base font-bold text-white">
                        <BarChart3 size={16} className="text-emerald-400" />
                        Chỉ Số Xanh Tỉnh Thành
                    </h1>
                    <p className="text-xs text-slate-400">Trang này đã được gộp vào Bản đồ ô nhiễm.</p>
                </div>
            </div>

            <div className="absolute bottom-6 left-4 z-10">
                <button
                    title="Thông tin"
                    aria-label="Thông tin"
                    className="mb-2 flex h-8 w-8 items-center justify-center rounded-full border border-slate-500/30 bg-slate-900/85 text-white"
                >
                    <Info size={16} />
                </button>
                <div className="min-w-[200px] rounded-xl border border-slate-500/30 bg-slate-900/90 p-3 text-xs text-slate-300 backdrop-blur">
                    Mục Chỉ Số Xanh đã được tích hợp trực tiếp vào trang Bản đồ ô nhiễm để tránh trùng lặp.
                </div>
            </div>
        </div>
    );
}
