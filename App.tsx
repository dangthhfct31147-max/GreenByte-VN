import React, { useEffect, useRef, useState } from 'react';
import { apiFetch, clearAuthToken } from '@/utils/api';
import {
  Home,
  Map,
  ShoppingBag,
  Users,
  Menu,
  X,
  Leaf,
  ShoppingCart,
  ChevronDown
} from 'lucide-react';
import { HomePage } from './components/pages/HomePage';
import { SignupPage } from './components/pages/SignupPage';
import { LoginPage } from './components/pages/LoginPage';
import { ProfilePage } from './components/pages/ProfilePage';
import { MapPage } from './components/pages/MapPage';
import { MarketplacePage, Product } from './components/pages/MarketplacePage';
import { CommunityPage } from './components/pages/CommunityPage';
import { CartPage } from './components/pages/CartPage';
import { ProductDetailPage } from './components/pages/ProductDetailPage';
import { SellerProfilePage } from './components/pages/SellerProfilePage';
import { MyListingsPage } from './components/pages/MyListingsPage';
import { AdminLoginPage } from './components/pages/AdminLoginPage';
import { AdminPage } from './components/pages/AdminPage';
import { GreenTokenDashboard } from './components/pages/GreenTokenDashboard';
import { GreenIndexMap } from './components/pages/GreenIndexMap';
import { getAdminToken, setAdminToken } from '@/utils/adminAuth';

// Types
type Route = 'home' | 'marketplace' | 'map' | 'community' | 'login' | 'signup' | 'cart' | 'profile' | 'my-listings' | 'product' | 'seller-profile' | 'admin-login' | 'admin' | 'green-tokens' | 'green-index';

// URL path to Route mapping
const pathToRoute: Record<string, Route> = {
  '/': 'home',
  '/home': 'home',
  '/marketplace': 'marketplace',
  '/map': 'map',
  '/community': 'community',
  '/login': 'login',
  '/signup': 'signup',
  '/cart': 'cart',
  '/profile': 'profile',
  '/my-listings': 'my-listings',
  '/product': 'product',
  '/seller': 'seller-profile',
  '/admin': 'admin',
  '/admin/login': 'admin-login',
  '/green-tokens': 'green-tokens',
  '/green-index': 'green-index',
};

const routeToPath: Record<Route, string> = {
  home: '/',
  marketplace: '/marketplace',
  map: '/map',
  community: '/community',
  login: '/login',
  signup: '/signup',
  cart: '/cart',
  profile: '/profile',
  'my-listings': '/my-listings',
  product: '/product',
  'seller-profile': '/seller',
  admin: '/admin',
  'admin-login': '/admin/login',
  'green-tokens': '/green-tokens',
  'green-index': '/green-index',
};

function getRouteFromPath(): { route: Route; productId: string | null; sellerId: string | null } {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);

  // Handle product detail page
  if (path.startsWith('/product/')) {
    const productId = path.split('/product/')[1];
    return { route: 'product', productId, sellerId: null };
  }

  if (path.startsWith('/sellers/')) {
    const sellerId = path.split('/sellers/')[1];
    return { route: 'seller-profile', productId: null, sellerId };
  }

  const productId = params.get('id');
  const route = pathToRoute[path] || 'home';

  return { route, productId: route === 'product' ? productId : null, sellerId: null };
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export default function App() {
  const initialState = getRouteFromPath();
  const [currentRoute, setCurrentRoute] = useState<Route>(initialState.route);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<{ name: string; id: string; email: string; avatarUrl?: string } | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  // Cart State (Lifted)
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // Product Detail State
  const [selectedProductId, setSelectedProductId] = useState<string | null>(initialState.productId);
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(initialState.sellerId);
  const [adminUser, setAdminUser] = useState<{ email: string } | null>(null);

  const getAvatarStorageKey = (userId: string) => `eco_user_avatar_${userId}`;
  const getAvatarFromStorage = (userId: string) => {
    try {
      return localStorage.getItem(getAvatarStorageKey(userId)) ?? undefined;
    } catch {
      return undefined;
    }
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
  };

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const { route, productId, sellerId } = getRouteFromPath();
      setCurrentRoute(route);
      setSelectedProductId(productId);
      setSelectedSellerId(sellerId);
      setIsMobileMenuOpen(false);
      setIsUserMenuOpen(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (route: Route, productId?: string) => {
    let path = routeToPath[route];

    if (route === 'product' && productId) {
      path = `/product/${productId}`;
      setSelectedProductId(productId);
      setSelectedSellerId(null);
    } else if (route === 'seller-profile' && productId) {
      path = `/sellers/${productId}`;
      setSelectedSellerId(productId);
      setSelectedProductId(null);
    } else {
      setSelectedProductId(null);
      setSelectedSellerId(null);
    }

    // Update browser history
    window.history.pushState({ route, productId }, '', path);

    setCurrentRoute(route);
    setIsMobileMenuOpen(false);
    setIsUserMenuOpen(false);
    window.scrollTo(0, 0);
  };

  // Cookie-based session: on boot, ask backend who we are.
  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await apiFetch('auth/me', {
          signal: controller.signal,
          cache: 'no-store',
        });
        const data = (await res.json()) as any;
        if (res.ok && data?.user) {
          const u = data.user as any;
          if (typeof u?.id === 'string' && typeof u?.name === 'string' && typeof u?.email === 'string') {
            setUser({ id: u.id, name: u.name, email: u.email, avatarUrl: getAvatarFromStorage(u.id) });
          }
        } else {
          setUser(null);
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          // If backend is down, keep logged-out UI (safe default)
          setUser(null);
        }
      } finally {
        setSessionChecked(true);
      }
    })();

    return () => controller.abort();
  }, []);

  const loadCart = async () => {
    if (!user) {
      setCartItems([]);
      return;
    }
    try {
      const res = await apiFetch('cart');
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data?.error ?? 'Không tải được giỏ hàng');
      setCartItems(Array.isArray(data?.cart?.items) ? data.cart.items : []);
    } catch {
      // If cart fails to load, keep empty to avoid breaking UX
      setCartItems([]);
    }
  };

  useEffect(() => {
    loadCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Cart Actions (database-backed)
  const addToCart = async (product: Product) => {
    if (!user) {
      navigate('signup');
      return;
    }
    try {
      const res = await apiFetch('cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      });
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data?.error ?? 'Không thêm vào giỏ hàng');

      const item = data.item as CartItem;
      setCartItems((prev) => {
        const existing = prev.find((x) => x.product.id === item.product.id);
        if (!existing) return [item, ...prev];
        return prev.map((x) => (x.product.id === item.product.id ? { ...x, quantity: item.quantity } : x));
      });
    } catch (e: any) {
      alert(e?.message ?? 'Có lỗi xảy ra');
    }
  };

  const updateQuantity = async (productId: string, delta: number) => {
    if (!user) return;

    const existing = cartItems.find((x) => x.product.id === productId);
    if (!existing) return;
    const nextQty = Math.max(1, existing.quantity + delta);

    const res = await apiFetch(`cart/items/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: nextQty }),
    });
    const data = (await res.json()) as any;
    if (!res.ok) return;

    const item = data.item as CartItem;
    setCartItems((prev) => prev.map((x) => (x.product.id === productId ? item : x)));
  };

  const removeFromCart = async (productId: string) => {
    if (!user) return;
    await apiFetch(`cart/items/${productId}`, { method: 'DELETE' });
    setCartItems((prev) => prev.filter((x) => x.product.id !== productId));
  };

  const handleLogout = async () => {
    try {
      await apiFetch('auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    clearAuthToken();
    setUser(null);
    setCartItems([]);
    navigate('home');
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!userMenuRef.current) return;
      if (!userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    if (isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isUserMenuOpen]);

  const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const isAdminRoute = currentRoute === 'admin' || currentRoute === 'admin-login';

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      setAdminUser(null);
      return;
    }

    const controller = new AbortController();
    (async () => {
      try {
        const res = await apiFetch('admin/auth/me', {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? 'Phiên admin không hợp lệ');
        setAdminUser({ email: data?.admin?.email ?? 'admin' });
      } catch {
        setAdminToken(null);
        setAdminUser(null);
        if (currentRoute === 'admin') {
          navigate('admin-login');
        }
      }
    })();

    return () => controller.abort();
  }, [currentRoute]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Navigation */}
      {!isAdminRoute && <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('home')}>
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white">
              <Leaf size={20} fill="currentColor" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900">Eco-Byproduct<span className="text-emerald-500">VN</span></span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8 font-medium text-sm">
            <button
              onClick={() => navigate('marketplace')}
              className={`hover:text-emerald-600 transition-colors ${currentRoute === 'marketplace' ? 'text-emerald-600' : 'text-slate-600'}`}
            >
              Sàn Nông Nghiệp
            </button>
            <button
              onClick={() => navigate('map')}
              className={`hover:text-emerald-600 transition-colors ${currentRoute === 'map' ? 'text-emerald-600' : 'text-slate-600'}`}
            >
              Bản Đồ Ô Nhiễm
            </button>
            <button
              onClick={() => navigate('community')}
              className={`hover:text-emerald-600 transition-colors ${currentRoute === 'community' ? 'text-emerald-600' : 'text-slate-600'}`}
            >
              Cộng Đồng
            </button>
            <button
              onClick={() => navigate('green-index')}
              className={`hover:text-emerald-600 transition-colors flex items-center gap-1 ${currentRoute === 'green-index' ? 'text-emerald-600' : 'text-slate-600'}`}
            >
              🗺️ Chỉ Số Xanh
            </button>
          </nav>

          {/* Auth & Cart Actions */}
          <div className="hidden md:flex items-center gap-4">

            {/* Cart Icon */}
            <button
              onClick={() => navigate('cart')}
              className={`relative p-2 transition-colors ${currentRoute === 'cart' ? 'text-emerald-600' : 'text-slate-600 hover:text-emerald-600'}`}
            >
              <ShoppingCart size={22} />
              {cartCount > 0 && (
                <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center border-2 border-white animate-in zoom-in">
                  {cartCount}
                </span>
              )}
            </button>

            <div className="w-px h-6 bg-slate-200 mx-1"></div>

            {user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen((prev) => !prev)}
                  className="flex items-center gap-2 rounded-full border border-slate-200 pl-1 pr-3 py-1 hover:border-emerald-300 transition-colors"
                  aria-haspopup="menu"
                >
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="User avatar" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-semibold text-xs flex items-center justify-center">
                      {getInitials(user.name)}
                    </div>
                  )}
                  <ChevronDown size={16} className={`text-slate-500 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg py-2 z-50">
                    <div className="px-3 pb-2 border-b border-slate-100">
                      <div className="text-sm font-medium text-slate-800 truncate">{user.name}</div>
                      <div className="text-xs text-slate-500 truncate">{user.email}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('profile')}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Cài đặt tài khoản
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('my-listings')}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Sản phẩm đã đăng
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('green-tokens')}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <span>🌱</span> Green Token
                    </button>
                    <div className="border-t border-slate-100 my-1"></div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50"
                    >
                      Đăng xuất
                    </button>
                  </div>
                )}
              </div>
            ) : sessionChecked ? (
              <>
                <button
                  onClick={() => navigate('login')}
                  className="text-sm font-medium text-slate-600 hover:text-slate-900 px-4 py-2"
                >
                  Đăng nhập
                </button>
                <button
                  onClick={() => navigate('signup')}
                  className="text-sm font-medium bg-slate-900 text-white hover:bg-emerald-600 transition-colors px-4 py-2 rounded-full shadow-sm"
                >
                  Đăng ký
                </button>
              </>
            ) : (
              <div className="text-sm text-slate-500">Đang kiểm tra phiên…</div>
            )}
          </div>

          {/* Mobile Toggle */}
          <button
            className="md:hidden p-2 text-slate-600"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-slate-100 bg-white p-4 space-y-4">
            <button onClick={() => navigate('marketplace')} className="block w-full text-left py-2 font-medium text-slate-600">Sàn Nông Nghiệp</button>
            <button onClick={() => navigate('map')} className="block w-full text-left py-2 font-medium text-slate-600">Bản Đồ Ô Nhiễm</button>
            <button onClick={() => navigate('community')} className="block w-full text-left py-2 font-medium text-slate-600">Cộng Đồng</button>
            <button onClick={() => navigate('green-tokens')} className="block w-full text-left py-2 font-medium text-emerald-600">🌱 Green Token</button>
            <button onClick={() => navigate('green-index')} className="block w-full text-left py-2 font-medium text-emerald-600">🗺️ Chỉ Số Xanh</button>
            <button onClick={() => navigate('cart')} className="flex items-center justify-between w-full py-2 font-medium text-slate-600">
              <span>Giỏ hàng</span>
              {cartCount > 0 && <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">{cartCount}</span>}
            </button>
            <hr />
            {user ? (
              <>
                <button onClick={() => navigate('profile')} className="block w-full text-left py-2 font-medium text-slate-600">Hồ sơ</button>
                <button onClick={() => navigate('my-listings')} className="block w-full text-left py-2 font-medium text-slate-600">Sản phẩm đã đăng</button>
                <button onClick={handleLogout} className="block w-full text-left py-2 font-medium text-red-500">Đăng xuất ({user.name})</button>
              </>
            ) : sessionChecked ? (
              <>
                <button onClick={() => navigate('login')} className="block w-full text-left py-2 font-medium text-slate-600">Đăng nhập</button>
                <button onClick={() => navigate('signup')} className="block w-full text-left py-2 font-medium text-emerald-600">Đăng ký ngay</button>
              </>
            ) : (
              <div className="py-2 text-sm text-slate-500">Đang kiểm tra phiên…</div>
            )}
          </div>
        )}
      </header>}

      {/* Main Content Area */}
      <main className="flex-1 bg-slate-50">
        {currentRoute === 'home' && <HomePage onNavigate={navigate} user={user} />}
        {currentRoute === 'signup' && (
          <SignupPage
            onSignupSuccess={({ user }) => {
              setUser(user);
              navigate('home');
            }}
          />
        )}
        {currentRoute === 'marketplace' && (
          <MarketplacePage
            user={user}
            onLoginRequest={() => navigate('signup')}
            addToCart={addToCart}
            onViewProduct={(productId) => navigate('product', productId)}
          />
        )}
        {currentRoute === 'product' && selectedProductId && (
          <ProductDetailPage
            productId={selectedProductId}
            user={user}
            onBack={() => window.history.back()}
            onAddToCart={addToCart}
            onLoginRequest={() => navigate('signup')}
            onViewSellerProfile={(sellerId) => navigate('seller-profile', sellerId)}
          />
        )}

        {currentRoute === 'seller-profile' && selectedSellerId && (
          <SellerProfilePage
            sellerId={selectedSellerId}
            onBack={() => window.history.back()}
            onViewProduct={(productId) => navigate('product', productId)}
          />
        )}
        {currentRoute === 'map' && (
          <MapPage user={user} onLoginRequest={() => navigate('signup')} />
        )}
        {currentRoute === 'community' && (
          <CommunityPage user={user} onLoginRequest={() => navigate('signup')} />
        )}
        {currentRoute === 'cart' && (
          <CartPage
            cartItems={cartItems}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeFromCart}
            onNavigate={navigate}
          />
        )}
        {currentRoute === 'login' && (
          <LoginPage
            onLoginSuccess={({ user }) => {
              setUser(user);
              navigate('home');
            }}
          />
        )}

        {currentRoute === 'profile' && user && (
          <ProfilePage
            user={user}
            onBack={() => navigate('home')}
            onUserUpdated={(u) => {
              setUser((prev) => (prev ? { ...u, avatarUrl: u.avatarUrl ?? prev.avatarUrl } : u));
            }}
            onAvatarUpdated={(avatarUrl) => {
              setUser((prev) => (prev ? { ...prev, avatarUrl } : prev));
            }}
          />
        )}

        {currentRoute === 'my-listings' && user && (
          <MyListingsPage
            onBack={() => navigate('home')}
            onViewProduct={(productId) => navigate('product', productId)}
          />
        )}

        {currentRoute === 'green-tokens' && (
          <GreenTokenDashboard user={user} onBack={() => navigate('home')} />
        )}

        {currentRoute === 'green-index' && (
          <GreenIndexMap onBack={() => navigate('home')} />
        )}

        {currentRoute === 'my-listings' && !user && (
          <div className="p-10 text-center text-slate-500">Vui lòng đăng nhập để xem sản phẩm đã đăng.</div>
        )}

        {currentRoute === 'profile' && !user && (
          <div className="p-10 text-center text-slate-500">Vui lòng đăng nhập để xem hồ sơ.</div>
        )}

        {currentRoute === 'admin-login' && (
          <AdminLoginPage
            onLoginSuccess={(adminEmail) => {
              setAdminUser({ email: adminEmail });
              navigate('admin');
            }}
            onBackHome={() => navigate('home')}
          />
        )}

        {currentRoute === 'admin' && adminUser && (
          <AdminPage
            adminEmail={adminUser.email}
            onBackHome={() => navigate('home')}
            onLogout={() => {
              setAdminToken(null);
              setAdminUser(null);
              navigate('admin-login');
            }}
          />
        )}

        {currentRoute === 'admin' && !adminUser && (
          <AdminLoginPage
            onLoginSuccess={(adminEmail) => {
              setAdminUser({ email: adminEmail });
              navigate('admin');
            }}
            onBackHome={() => navigate('home')}
          />
        )}
      </main>

      {/* Footer */}
      {!isAdminRoute && currentRoute !== 'map' && currentRoute !== 'green-index' && (
        <footer className="bg-white border-t border-slate-200 py-12">
          <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 bg-slate-900 rounded flex items-center justify-center text-white">
                  <Leaf size={14} />
                </div>
                <span className="font-bold text-slate-900">Eco-Byproduct VN</span>
              </div>
              <p className="text-slate-500 text-sm leading-relaxed">
                Kết nối nguồn lực, giảm thiểu rác thải, kiến tạo tương lai xanh cho nông nghiệp Việt Nam.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-4">Nền tảng</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li>Về chúng tôi</li>
                <li>Quy chế hoạt động</li>
                <li>Chính sách bảo mật</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-4">Hỗ trợ</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li>Trung tâm trợ giúp</li>
                <li>Báo cáo vi phạm</li>
                <li>Liên hệ</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-4">Newsletter</h4>
              <div className="flex gap-2">
                <input type="email" placeholder="Email của bạn" className="bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm w-full outline-none focus:border-emerald-500" />
                <button className="bg-emerald-500 text-white px-4 py-2 rounded text-sm font-medium hover:bg-emerald-600">Gửi</button>
              </div>
            </div>
          </div>
          <div className="container mx-auto px-4 mt-12 pt-8 border-t border-slate-100 text-center text-slate-400 text-sm">
            © 2024 Eco-Byproduct VN. Built with ❤️ for Vietnam Environment.
          </div>
        </footer>
      )}
    </div>
  );
}