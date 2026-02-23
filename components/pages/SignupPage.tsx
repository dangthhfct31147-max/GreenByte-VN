import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight, Loader2, ChevronDown, MapPin } from 'lucide-react';
import { apiFetch, setAuthToken } from '@/utils/api';

const PROVINCES = [
  'An Giang',
  'Bà Rịa - Vũng Tàu',
  'Bắc Giang',
  'Bắc Kạn',
  'Bạc Liêu',
  'Bắc Ninh',
  'Bến Tre',
  'Bình Định',
  'Bình Dương',
  'Bình Phước',
  'Bình Thuận',
  'Cà Mau',
  'Cần Thơ',
  'Cao Bằng',
  'Đà Nẵng',
  'Đắk Lắk',
  'Đắk Nông',
  'Điện Biên',
  'Đồng Nai',
  'Đồng Tháp',
  'Gia Lai',
  'Hà Giang',
  'Hà Nam',
  'Hà Nội',
  'Hà Tĩnh',
  'Hải Dương',
  'Hải Phòng',
  'Hậu Giang',
  'Hòa Bình',
  'Hưng Yên',
  'Khánh Hòa',
  'Kiên Giang',
  'Kon Tum',
  'Lai Châu',
  'Lâm Đồng',
  'Lạng Sơn',
  'Lào Cai',
  'Long An',
  'Nam Định',
  'Nghệ An',
  'Ninh Bình',
  'Ninh Thuận',
  'Phú Thọ',
  'Phú Yên',
  'Quảng Bình',
  'Quảng Nam',
  'Quảng Ngãi',
  'Quảng Ninh',
  'Quảng Trị',
  'Sóc Trăng',
  'Sơn La',
  'Tây Ninh',
  'Thái Bình',
  'Thái Nguyên',
  'Thanh Hóa',
  'Thừa Thiên Huế',
  'Tiền Giang',
  'Hồ Chí Minh',
  'Trà Vinh',
  'Tuyên Quang',
  'Vĩnh Long',
  'Vĩnh Phúc',
  'Yên Bái',
];

export const SignupPage = ({
  onSignupSuccess,
}: {
  onSignupSuccess: (args: {
    user: { id: string; email: string; name: string };
  }) => void;
}) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    province: '',
    agreeTerms: false,
    role: 'USER'
  });

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 1) {
      // Basic validation for Step 1
      if (!formData.name || !formData.email || !formData.password || !formData.province) {
        alert("Vui lòng điền đầy đủ thông tin và chọn khu vực.");
        return;
      }
      setStep(2);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (!formData.agreeTerms) return;
    setLoading(true);

    try {
      const res = await apiFetch('auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });
      const raw = await res.text();
      let data: any = undefined;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = undefined;
      }

      if (!res.ok) {
        throw new Error(data?.error ?? raw ?? `HTTP ${res.status}`);
      }

      if (!data?.user) {
        throw new Error('Phản hồi từ máy chủ không hợp lệ. Vui lòng thử lại.');
      }

      if (typeof data?.token === 'string' && data.token) {
        setAuthToken(data.token);
      }

      // Delegate storing session/token to App
      onSignupSuccess({ user: data.user });
    } catch (e: any) {
      alert(e?.message ?? 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center py-12 px-4 select-none">
      <div className="w-full max-w-md">

        {/* Stepper Header */}
        <div className="mb-8">
          <div className="flex justify-between text-sm font-medium text-slate-500 mb-2">
            <span className={step >= 1 ? "text-emerald-600" : ""}>Thông tin</span>
            <span className={step >= 2 ? "text-emerald-600" : ""}>Điều khoản</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-emerald-500"
              initial={{ width: "0%" }}
              animate={{ width: step === 1 ? "50%" : "100%" }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            />
          </div>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {step === 1 ? 'Tạo tài khoản mới' : 'Xác nhận & Cam kết'}
          </h2>
          <p className="text-slate-500 text-sm mb-6">
            {step === 1 ? 'Tham gia cộng đồng GreenByte VN ngay hôm nay.' : 'Chúng tôi đề cao tính trung thực và trách nhiệm.'}
          </p>

          <form onSubmit={handleNext}>
            <AnimatePresence mode="wait">
              {step === 1 ? (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Họ và tên</label>
                    <input
                      required
                      type="text"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      placeholder="Nguyễn Văn A"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input
                      required
                      type="email"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      placeholder="email@example.com"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Mật khẩu</label>
                    <input
                      required
                      type="password"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                    />
                  </div>

                  {/* Custom Dropdown UI */}
                  <div className="relative">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Tỉnh/Thành phố</label>
                    <button
                      type="button"
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className={`w-full px-4 py-2.5 rounded-lg border bg-white text-left flex items-center justify-between transition-all ${isDropdownOpen
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 hover:border-emerald-400'
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <MapPin size={16} className={formData.province ? "text-emerald-500" : "text-slate-400"} />
                        <span className={formData.province ? "text-slate-900 font-medium" : "text-slate-400"}>
                          {formData.province || "Chọn khu vực sinh sống"}
                        </span>
                      </div>
                      <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180 text-emerald-500' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {isDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)} />
                          <motion.div
                            initial={{ opacity: 0, y: 4, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.98 }}
                            transition={{ duration: 0.15 }}
                            className="absolute top-full left-0 w-full mt-2 bg-white rounded-xl shadow-xl border border-slate-100 z-20 max-h-60 overflow-y-auto custom-scrollbar"
                          >
                            <div className="py-1">
                              {PROVINCES.map((p) => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => {
                                    setFormData({ ...formData, province: p });
                                    setIsDropdownOpen(false);
                                  }}
                                  className={`w-full px-4 py-2.5 text-left flex items-center justify-between group transition-colors ${formData.province === p ? 'bg-emerald-50 text-emerald-700' : 'hover:bg-slate-50 text-slate-600'
                                    }`}
                                >
                                  <span className={`text-sm ${formData.province === p ? 'font-semibold' : 'group-hover:text-slate-900'}`}>
                                    {p}
                                  </span>
                                  {formData.province === p && <Check size={16} className="text-emerald-600" />}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                </motion.div>
              ) : (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-100">
                    <h4 className="font-semibold text-emerald-800 text-sm mb-2">Cam kết thành viên</h4>
                    <ul className="list-disc list-inside text-sm text-emerald-700 space-y-1">
                      <li>Chỉ đăng tải thông tin phụ phẩm có thật.</li>
                      <li>Không spam bản đồ ô nhiễm.</li>
                      <li>Tôn trọng cộng đồng và môi trường.</li>
                    </ul>
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        required
                        className="peer sr-only"
                        checked={formData.agreeTerms}
                        onChange={e => setFormData({ ...formData, agreeTerms: e.target.checked })}
                      />
                      <div className="w-5 h-5 border-2 border-slate-300 rounded peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all bg-white"></div>
                      <Check size={14} className="absolute text-white opacity-0 peer-checked:opacity-100 left-0.5 top-0.5 pointer-events-none" />
                    </div>
                    <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors">
                      Tôi đồng ý với điều khoản sử dụng và chính sách bảo mật của GreenByte VN.
                    </span>
                  </label>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-8 flex gap-3">
              {step === 2 && (
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-6 py-2 rounded-lg text-slate-600 font-medium hover:bg-slate-100 transition-colors"
                >
                  Quay lại
                </button>
              )}
              <button
                type="submit"
                disabled={loading || (step === 2 && !formData.agreeTerms)}
                className="flex-1 bg-slate-900 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : (
                  <>
                    {step === 1 ? 'Tiếp tục' : 'Hoàn tất đăng ký'}
                    {step === 1 && <ChevronRight size={18} />}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
