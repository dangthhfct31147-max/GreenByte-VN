import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Leaf, Map as MapIcon, RefreshCw, Users, TrendingUp, Globe, Heart, BookOpen, Quote } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiFetch } from '@/utils/api';

// Inspiring stories data
const inspiringStories = [
  {
    id: 1,
    image: 'https://upload.wikimedia.org/wikipedia/commons/8/89/Straw_of_the_rice.08Oct9.jpg',
    title: 'Cần Thơ: tuần hoàn rơm rạ sau thu hoạch',
    excerpt: 'Theo IRRI (2025), mô hình tại HTX Tiến Thuận ghi nhận khoảng 50 tấn phân hữu cơ/tháng và 750-900 kg nấm rơm mỗi chu kỳ 40-42 ngày từ rơm cuộn.',
    author: 'IRRI / VIETRISA',
    location: 'Cần Thơ',
  },
  {
    id: 2,
    image: 'https://upload.wikimedia.org/wikipedia/commons/d/d0/Bagasse_in_Hainan_-_02.jpg',
    title: 'Bã mía phát điện sinh khối quy mô nhà máy',
    excerpt: 'Hồ sơ dự án Victorias (Philippines) cho thấy mô hình đồng phát điện từ bã mía đạt công suất 50 MW, minh họa tiềm năng tận dụng phụ phẩm mía đường cho năng lượng sạch.',
    author: 'Power Technology / GlobalData',
    location: 'Philippines',
  },
  {
    id: 3,
    image: 'https://upload.wikimedia.org/wikipedia/commons/6/6c/Bata_Candi-candi_Batujaya.JPG',
    title: 'Quảng Ninh: gạch không nung từ tro xỉ',
    excerpt: 'Mô hình tại Quảng Ninh ghi nhận cấp phối 80% tro xỉ + 20% xi măng, công suất khoảng 60 triệu viên/năm, giúp giảm khai thác đất sét theo định hướng vật liệu xây dựng xanh.',
    author: 'Vietnam Circular Economy',
    location: 'Quảng Ninh',
  },
];

// Benefits data
const benefits = [
  {
    id: 1,
    icon: TrendingUp,
    title: 'Lợi ích Kinh tế',
    description: 'Tăng thu nhập từ 30-50% cho nông hộ thông qua việc bán phụ phẩm thay vì đốt bỏ.',
    color: 'from-amber-400 to-orange-500',
    bgColor: 'bg-amber-50',
    stats: '+45%',
    statsLabel: 'Thu nhập tăng',
  },
  {
    id: 2,
    icon: Globe,
    title: 'Bảo vệ Môi trường',
    description: 'Giảm thiểu khói bụi, ô nhiễm không khí và bảo vệ đất đai cho thế hệ tương lai.',
    color: 'from-emerald-400 to-teal-500',
    bgColor: 'bg-emerald-50',
    stats: '-70%',
    statsLabel: 'Khí thải giảm',
  },
  {
    id: 3,
    icon: Heart,
    title: 'Lợi ích Xã hội',
    description: 'Tạo việc làm mới, nâng cao nhận thức cộng đồng và xây dựng nông thôn xanh.',
    color: 'from-rose-400 to-pink-500',
    bgColor: 'bg-rose-50',
    stats: '2,000+',
    statsLabel: 'Việc làm mới',
  },
];

// Animation variants
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

type RecommendationProduct = {
  id: string;
  title: string;
  category: string;
  price: number;
  location: string;
  reason: string;
};

type RecommendationDiscussion = {
  id: string;
  user_name: string;
  content: string;
  tags: string[];
  reason: string;
};

type RecommendationEvent = {
  id: string;
  title: string;
  location: string;
  start_at: string;
  display_date?: string;
  reason: string;
};

type RecommendationPayload = {
  personalized: boolean;
  based_on: string[];
  products: RecommendationProduct[];
  discussions: RecommendationDiscussion[];
  events: RecommendationEvent[];
};

export const HomePage = ({
  onNavigate,
  user,
}: {
  onNavigate: (route: any, productId?: string) => void;
  user?: { id: string; name: string } | null;
}) => {
  const [recommendations, setRecommendations] = useState<RecommendationPayload | null>(null);

  useEffect(() => {
    if (!user) {
      setRecommendations(null);
      return;
    }

    const controller = new AbortController();
    apiFetch('recommendations?takeProducts=3&takeDiscussions=3&takeEvents=3', {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (res) => {
        const data = (await res.json()) as RecommendationPayload;
        if (!res.ok) throw new Error('Không tải được gợi ý cá nhân hóa');
        setRecommendations(data);
      })
      .catch((error: any) => {
        if (error?.name !== 'AbortError') {
          setRecommendations(null);
        }
      });

    return () => controller.abort();
  }, [user?.id]);

  const recommendationHints = useMemo(() => recommendations?.based_on?.slice(0, 3) ?? [], [recommendations?.based_on]);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(price);

  return (
    <div className="flex flex-col select-none">
      {/* Hero Section - Clean Design */}
      <section className="relative pt-16 pb-24 md:pt-24 md:pb-32 overflow-hidden bg-gradient-to-br from-white via-emerald-50/30 to-teal-50/30">
        {/* Subtle background decorations */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-emerald-100/40 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-72 h-72 bg-gradient-to-tr from-teal-100/40 to-transparent rounded-full blur-3xl" />
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left - Text Content */}
            <div className="max-w-xl">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-700 text-sm font-medium mb-6 shadow-sm"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>🌱 Nền tảng Eco-Tech số 1 Việt Nam</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 leading-tight mb-6"
              >
                Biến phụ phẩm thành <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500">
                  Tài nguyên xanh
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-lg md:text-xl text-slate-600 mb-10 leading-relaxed"
              >
                Kết nối <strong className="text-emerald-600">nông dân</strong>, <strong className="text-teal-600">doanh nghiệp</strong> và <strong className="text-cyan-600">cộng đồng</strong> để tái sử dụng rơm rạ, vỏ trấu, và bã mía. Cùng nhau giảm thiểu rác thải và bảo vệ môi trường Việt Nam.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="flex flex-col sm:flex-row gap-4"
              >
                <button
                  onClick={() => onNavigate('marketplace')}
                  className="group inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-full font-medium hover:from-emerald-700 hover:to-teal-700 transition-all shadow-lg hover:shadow-emerald-500/30"
                >
                  Tham gia Marketplace
                  <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </button>
                <button
                  onClick={() => onNavigate('map')}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white border-2 border-slate-200 text-slate-700 rounded-full font-medium hover:bg-emerald-50 hover:border-emerald-300 transition-all"
                >
                  <MapIcon size={20} />
                  Bản đồ ô nhiễm
                </button>
              </motion.div>
            </div>

            {/* Right - Hero Image */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="hidden lg:block"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-3xl rotate-3 opacity-20" />
                <img
                  src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=600&h=400&fit=crop"
                  alt="Cánh đồng xanh Việt Nam"
                  className="relative w-full h-80 object-cover rounded-3xl shadow-2xl"
                />
                {/* Overlay stats */}
                <div className="absolute -bottom-6 -left-6 bg-white rounded-2xl shadow-xl p-4 flex items-center gap-3">
                  <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                    <Leaf className="text-emerald-600" size={24} />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900">15,203</div>
                    <div className="text-sm text-slate-500">Tấn đã tái chế</div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Realtime Stats */}
      <section className="bg-white border-y border-slate-100 py-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-50/50 via-transparent to-teal-50/50" />
        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            <motion.div variants={fadeInUp}>
              <StatCard
                icon={<RefreshCw className="text-blue-500" size={32} />}
                value="15,203"
                label="Tấn phụ phẩm được tái chế"
                sub="Tăng 12% so với tháng trước"
              />
            </motion.div>
            <motion.div variants={fadeInUp}>
              <StatCard
                icon={<Leaf className="text-emerald-500" size={32} />}
                value="8,400"
                label="Tấn CO2e được giảm thiểu"
                sub="*Ước tính dựa trên hệ số IPCC"
              />
            </motion.div>
            <motion.div variants={fadeInUp}>
              <StatCard
                icon={<Users className="text-purple-500" size={32} />}
                value="2,150"
                label="Thành viên tích cực"
                sub="Trên 63 tỉnh thành"
              />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Inspiring Stories Section */}
      <section className="py-20 bg-gradient-to-b from-slate-50 to-white relative overflow-hidden">
        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={staggerContainer}
            className="text-center mb-16"
          >
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-100 text-amber-700 text-sm font-medium mb-4">
              <BookOpen size={16} />
              Câu chuyện truyền cảm hứng
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-3xl md:text-5xl font-bold text-slate-900 mb-4">
              Những <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-500">câu chuyện thành công</span>
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-lg text-slate-600 max-w-2xl mx-auto">
              Khám phá những câu chuyện đầy cảm hứng từ nông dân và doanh nghiệp đã thành công trong việc tái chế phụ phẩm nông nghiệp.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {inspiringStories.map((story) => (
              <motion.div key={story.id} variants={fadeInUp}>
                <StoryCard story={story} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-white relative overflow-hidden">
        <div className="absolute top-1/2 left-0 w-64 h-64 bg-gradient-to-r from-emerald-100/50 to-transparent rounded-full blur-3xl -translate-y-1/2" />
        <div className="absolute top-1/2 right-0 w-64 h-64 bg-gradient-to-l from-teal-100/50 to-transparent rounded-full blur-3xl -translate-y-1/2" />

        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={staggerContainer}
            className="text-center mb-16"
          >
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 text-emerald-700 text-sm font-medium mb-4">
              <Leaf size={16} />
              Vì sao nên tham gia?
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-3xl md:text-5xl font-bold text-slate-900 mb-4">
              Lợi ích của việc <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-500">bán phụ phẩm</span>
            </motion.h2>
            <motion.p variants={fadeInUp} className="text-lg text-slate-600 max-w-2xl mx-auto">
              Tham gia nền tảng không chỉ giúp bạn tăng thu nhập mà còn góp phần bảo vệ môi trường và xây dựng cộng đồng bền vững.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {benefits.map((benefit) => (
              <motion.div key={benefit.id} variants={fadeInUp}>
                <BenefitCard benefit={benefit} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Personalized recommendations */}
      {user && recommendations && (
        <section className="py-10 bg-white border-y border-slate-100">
          <div className="container mx-auto px-4">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
              <div>
                <h3 className="text-2xl font-bold text-slate-900">Gợi ý cho bạn</h3>
                <p className="text-sm text-slate-500">Cá nhân hóa theo thói quen tiêu dùng và hoạt động cộng đồng của bạn.</p>
              </div>
              {recommendationHints.length > 0 && (
                <div className="flex flex-nowrap gap-2 overflow-x-auto max-w-full sm:justify-end">
                  {recommendationHints.map((hint) => (
                    <span key={hint} className="shrink-0 whitespace-nowrap text-xs px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                      {hint}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="font-semibold text-slate-900 mb-3">Sản phẩm gợi ý</div>
                <div className="space-y-3">
                  {recommendations.products.length > 0 ? (
                    recommendations.products.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => onNavigate('product', item.id)}
                        className="w-full text-left rounded-xl bg-white border border-slate-200 p-3 hover:border-emerald-300 transition-colors"
                      >
                        <div className="font-medium text-slate-900 line-clamp-1">{item.title}</div>
                        <div className="text-xs text-slate-500 mt-1">{item.location} • {item.category}</div>
                        <div className="text-sm font-semibold text-emerald-700 mt-1">{formatPrice(item.price)}</div>
                        <div className="text-xs text-slate-500 mt-1 line-clamp-1">{item.reason}</div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-xl bg-white border border-dashed border-slate-300 p-3 text-sm text-slate-500">
                      Chưa có sản phẩm phù hợp lúc này. Hãy tương tác thêm để hệ thống gợi ý tốt hơn.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="font-semibold text-slate-900 mb-3">Thảo luận nên đọc</div>
                <div className="space-y-3">
                  {recommendations.discussions.length > 0 ? (
                    recommendations.discussions.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => onNavigate('community')}
                        className="w-full text-left rounded-xl bg-white border border-slate-200 p-3 hover:border-emerald-300 transition-colors"
                      >
                        <div className="text-xs text-slate-500">{item.user_name}</div>
                        <div className="text-sm text-slate-900 mt-1 line-clamp-2">{item.content}</div>
                        {item.tags.length > 0 && (
                          <div className="text-xs text-emerald-700 mt-1 line-clamp-1">{item.tags.slice(0, 2).join(' • ')}</div>
                        )}
                        <div className="text-xs text-slate-500 mt-1 line-clamp-1">{item.reason}</div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-xl bg-white border border-dashed border-slate-300 p-3 text-sm text-slate-500">
                      Chưa có thảo luận nổi bật lúc này. Vào cộng đồng để xem các chủ đề mới nhất.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="font-semibold text-slate-900 mb-3">Sự kiện/Workshop phù hợp</div>
                <div className="space-y-3">
                  {recommendations.events.length > 0 ? (
                    recommendations.events.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => onNavigate('community')}
                        className="w-full text-left rounded-xl bg-white border border-slate-200 p-3 hover:border-emerald-300 transition-colors"
                      >
                        <div className="font-medium text-slate-900 line-clamp-1">{item.title}</div>
                        <div className="text-xs text-slate-500 mt-1">{item.display_date ?? new Date(item.start_at).toLocaleDateString('vi-VN')} • {item.location}</div>
                        <div className="text-xs text-slate-500 mt-1 line-clamp-1">{item.reason}</div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-xl bg-white border border-dashed border-slate-300 p-3 text-sm text-slate-500">
                      Chưa có sự kiện phù hợp lúc này. Hãy quay lại sau để xem workshop mới.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Call to Action */}
      <section className="py-20 bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-full h-full home-cta-pattern" />
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
              Sẵn sàng tham gia cuộc cách mạng xanh?
            </h2>
            <p className="text-lg md:text-xl text-white/90 max-w-2xl mx-auto mb-10">
              Đăng ký ngay hôm nay để bắt đầu hành trình biến phụ phẩm nông nghiệp thành thu nhập bền vững.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => onNavigate('signup')}
                className="group inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-emerald-600 rounded-full font-bold hover:bg-slate-100 transition-all shadow-xl hover:shadow-2xl"
              >
                Đăng ký miễn phí
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => onNavigate('community')}
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white/20 backdrop-blur text-white border-2 border-white/50 rounded-full font-medium hover:bg-white/30 transition-all"
              >
                <Users size={20} />
                Tham gia cộng đồng
              </button>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

// Story Card Component
const StoryCard = ({ story }: { story: typeof inspiringStories[0] }) => (
  <div className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 hover:border-emerald-200">
    <div className="relative h-48 overflow-hidden">
      <img
        src={story.image}
        alt={story.title}
        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
      <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2">
        <span className="px-3 py-1 bg-white/90 backdrop-blur text-xs font-medium text-slate-700 rounded-full">
          📍 {story.location}
        </span>
      </div>
    </div>
    <div className="p-6">
      <h3 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-emerald-600 transition-colors">
        {story.title}
      </h3>
      <p className="text-slate-600 text-sm mb-4 line-clamp-3">
        {story.excerpt}
      </p>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Quote size={14} className="text-emerald-500" />
        <span className="font-medium">{story.author}</span>
      </div>
    </div>
  </div>
);

// Benefit Card Component
const BenefitCard = ({ benefit }: { benefit: typeof benefits[0] }) => {
  const Icon = benefit.icon;
  return (
    <div className={`group p-8 rounded-2xl ${benefit.bgColor} border border-transparent hover:border-slate-200 hover:bg-white hover:shadow-xl transition-all duration-300`}>
      <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${benefit.color} text-white mb-6 shadow-lg group-hover:scale-110 transition-transform`}>
        <Icon size={32} />
      </div>
      <div className="mb-4">
        <span className={`text-4xl font-bold bg-gradient-to-r ${benefit.color} bg-clip-text text-transparent`}>
          {benefit.stats}
        </span>
        <span className="block text-sm text-slate-500 mt-1">{benefit.statsLabel}</span>
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-3">
        {benefit.title}
      </h3>
      <p className="text-slate-600">
        {benefit.description}
      </p>
    </div>
  );
};

// Stat Card Component
const StatCard = ({ icon, value, label, sub }: { icon: React.ReactNode; value: string; label: string; sub: string }) => (
  <div className="flex items-start gap-4 p-6 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
    <div className="p-3 bg-slate-50 rounded-xl">
      {icon}
    </div>
    <div>
      <div className="text-3xl font-bold text-slate-900 mb-1">{value}</div>
      <div className="text-sm font-medium text-slate-900 mb-1">{label}</div>
      <div className="text-xs text-slate-500">{sub}</div>
    </div>
  </div>
);