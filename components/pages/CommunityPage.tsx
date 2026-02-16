import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Heart,
  MessageCircle,
  Share2,
  Calendar,
  MapPin,
  Users,
  Image as ImageIcon,
  Send,
  MoreHorizontal,
  Clock,
  ThumbsUp,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch, getApiUrl } from '@/utils/api';

// --- Types ---

interface Post {
  id: string;
  user_name: string;
  user_avatar?: string;
  content: string;
  image?: string;
  likes: number;
  comments: number;
  timestamp: string;
  tags: string[];
  is_liked: boolean;
}

interface Comment {
  id: string;
  user_name: string;
  content: string;
  timestamp: string;
  created_at: string;
}

type CommentOrder = 'asc' | 'desc';

interface TrendingTopic {
  tag: string;
  count: number;
  label: string;
}

type CommunityStreamEvent =
  | { type: 'connected'; at: string }
  | { type: 'post_created'; postId: string; createdAt: string }
  | {
    type: 'comment_created';
    postId: string;
    commentCount: number;
    comment: Comment;
    createdAt: string;
  }
  | { type: 'like_changed'; postId: string; likeCount: number; createdAt: string };

const DEFAULT_TRENDING_TOPICS: TrendingTopic[] = [
  { tag: '#NongNghiepBenVung', count: 1200, label: '1.2k bài viết' },
  { tag: '#TaiCheRomRa', count: 856, label: '856 bài viết' },
  { tag: '#BienDoiKhiHau', count: 540, label: '540 bài viết' },
  { tag: '#KhoiNghiepXanh', count: 320, label: '320 bài viết' },
];

const TRENDING_TOPICS_LIMIT = 4;

interface Event {
  id: string;
  title: string;
  date: string;
  month: string;
  time: string;
  location: string;
  image: string;
  attendees: number;
  description: string;
  organizer: string;
  is_going: boolean;
}

const FALLBACK_ACTIVE_MEMBERS = [
  'Lê Minh An',
  'Nguyễn Thu Linh',
  'Trần Gia Huy',
  'Phạm Ngọc Hoa',
  'Đỗ Khánh Vy',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(-2).map((part) => part.charAt(0).toUpperCase()).join('');
}

// --- Component ---

interface CommunityPageProps {
  user: { id: string; name: string } | null;
  onLoginRequest: () => void;
}

export const CommunityPage: React.FC<CommunityPageProps> = ({ user, onLoginRequest }) => {
  const [activeTab, setActiveTab] = useState<'feed' | 'events'>('feed');
  const [posts, setPosts] = useState<Post[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostImageUrl, setNewPostImageUrl] = useState('');
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentsByPost, setCommentsByPost] = useState<Record<string, Comment[]>>({});
  const [commentOrderByPost, setCommentOrderByPost] = useState<Record<string, CommentOrder>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [loadingComments, setLoadingComments] = useState<Record<string, boolean>>({});
  const [postingComment, setPostingComment] = useState<Record<string, boolean>>({});
  const [shareFeedback, setShareFeedback] = useState<Record<string, string>>({});
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>(DEFAULT_TRENDING_TOPICS);
  const expandedCommentsRef = useRef<Record<string, boolean>>({});
  const loadingCommentsRef = useRef<Record<string, boolean>>({});
  const commentOrderByPostRef = useRef<Record<string, CommentOrder>>({});

  const jsonHeaders = useMemo(() => ({ 'Content-Type': 'application/json' }), []);

  useEffect(() => {
    expandedCommentsRef.current = expandedComments;
  }, [expandedComments]);

  useEffect(() => {
    loadingCommentsRef.current = loadingComments;
  }, [loadingComments]);

  useEffect(() => {
    commentOrderByPostRef.current = commentOrderByPost;
  }, [commentOrderByPost]);

  const activeMembers = useMemo(() => {
    const contributorCounter = new Map<string, number>();
    posts.forEach((post) => {
      contributorCounter.set(post.user_name, (contributorCounter.get(post.user_name) ?? 0) + 1);
    });

    if (contributorCounter.size === 0) {
      return FALLBACK_ACTIVE_MEMBERS.map((name) => ({
        name,
        posts: 0,
        initials: getInitials(name),
      }));
    }

    return [...contributorCounter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, postCount]) => ({
        name,
        posts: postCount,
        initials: getInitials(name),
      }));
  }, [posts]);

  const insertCommentByOrder = useCallback((items: Comment[], nextComment: Comment, order: CommentOrder): Comment[] => {
    if (items.some((item) => item.id === nextComment.id)) return items;
    if (items.length === 0) return [nextComment];

    const nextTime = Date.parse(nextComment.created_at);
    if (Number.isNaN(nextTime)) {
      return order === 'desc' ? [nextComment, ...items] : [...items, nextComment];
    }

    const list = [...items];
    let insertIndex = list.length;

    for (let index = 0; index < list.length; index++) {
      const currentTime = Date.parse(list[index].created_at);
      if (Number.isNaN(currentTime)) continue;

      if (order === 'asc') {
        if (nextTime < currentTime) {
          insertIndex = index;
          break;
        }
      } else if (nextTime > currentTime) {
        insertIndex = index;
        break;
      }
    }

    list.splice(insertIndex, 0, nextComment);
    return list;
  }, []);

  const refreshPostsAndTopics = useCallback(async (signal?: AbortSignal) => {
    const [postsResult, topicsResult] = await Promise.allSettled([
      apiFetch('posts', { signal }).then(r => r.ok ? r.json() : Promise.reject()),
      apiFetch(`posts/trending-topics?take=${TRENDING_TOPICS_LIMIT}`, { signal }).then(r => r.ok ? r.json() : Promise.reject()),
    ]);

    if (postsResult.status === 'fulfilled' && Array.isArray(postsResult.value?.posts)) {
      setPosts(postsResult.value.posts);
    }

    if (topicsResult.status === 'fulfilled' && Array.isArray(topicsResult.value?.topics) && topicsResult.value.topics.length > 0) {
      setTrendingTopics((topicsResult.value.topics as TrendingTopic[]).slice(0, TRENDING_TOPICS_LIMIT));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    Promise.allSettled([
      refreshPostsAndTopics(controller.signal),
      apiFetch('events', { signal: controller.signal }).then(r => r.ok ? r.json() : Promise.reject()),
    ]).then(([, eventsResult]) => {
      if (eventsResult.status === 'fulfilled' && Array.isArray(eventsResult.value?.events)) {
        setEvents(eventsResult.value.events);
      } else {
        setEvents([]);
      }
    });

    return () => controller.abort();
  }, [refreshPostsAndTopics, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;

    const stream = new EventSource(getApiUrl('posts/stream'), { withCredentials: true });

    stream.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as CommunityStreamEvent;

        if (payload.type === 'post_created') {
          void refreshPostsAndTopics();
          return;
        }

        if (payload.type === 'comment_created') {
          setPosts((prev) => prev.map((post) =>
            post.id === payload.postId ? { ...post, comments: payload.commentCount } : post
          ));

          if (expandedCommentsRef.current[payload.postId]) {
            setCommentsByPost((prev) => {
              const current = prev[payload.postId];
              if (!current) return prev;
              const order = commentOrderByPostRef.current[payload.postId] ?? 'asc';
              return {
                ...prev,
                [payload.postId]: insertCommentByOrder(current, payload.comment, order),
              };
            });
          }
          return;
        }

        if (payload.type === 'like_changed') {
          setPosts((prev) => prev.map((post) =>
            post.id === payload.postId ? { ...post, likes: payload.likeCount } : post
          ));
        }
      } catch {
        // ignore malformed events
      }
    };

    stream.onerror = () => {
      // EventSource automatically reconnects
    };

    return () => {
      stream.close();
    };
  }, [insertCommentByOrder, refreshPostsAndTopics]);

  // Actions
  const handleLike = (id: string) => {
    if (!user) { onLoginRequest(); return; }
    const target = posts.find(p => p.id === id);
    if (!target) return;
    const nextLiked = !target.is_liked;
    setPosts(posts.map(p => p.id === id ? { ...p, is_liked: nextLiked, likes: nextLiked ? p.likes + 1 : p.likes - 1 } : p));

    apiFetch(`posts/${id}/like`, {
      method: nextLiked ? 'POST' : 'DELETE',
      headers: jsonHeaders,
    }).catch(() => {
      // revert on failure
      setPosts(posts);
    });
  };

  const handleRSVP = (id: string) => {
    if (!user) { onLoginRequest(); return; }
    const target = events.find(e => e.id === id);
    if (!target) return;
    const nextGoing = !target.is_going;
    setEvents(events.map(e => e.id === id ? { ...e, is_going: nextGoing, attendees: nextGoing ? e.attendees + 1 : e.attendees - 1 } : e));

    apiFetch(`events/${id}/rsvp`, {
      method: nextGoing ? 'POST' : 'DELETE',
      headers: jsonHeaders,
    }).catch(() => {
      setEvents(events);
    });
  };

  const handlePost = async () => {
    if (!user) { onLoginRequest(); return; }
    if (!newPostContent.trim()) return;

    try {
      const res = await apiFetch('posts', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          content: newPostContent,
          image: newPostImageUrl || undefined,
          tags: [],
        }),
      });
      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data?.error ?? 'Đăng bài thất bại');
      setPosts([data.post as Post, ...posts]);
      setNewPostContent('');
      setNewPostImageUrl('');
    } catch (e: any) {
      alert(e?.message ?? 'Có lỗi xảy ra');
    }
  };

  const handleAddImage = () => {
    const rawValue = window.prompt('Dán URL ảnh cho bài viết (https://...)', newPostImageUrl);
    if (rawValue === null) return;

    const imageUrl = rawValue.trim();
    if (!imageUrl) {
      setNewPostImageUrl('');
      return;
    }

    try {
      new URL(imageUrl);
      setNewPostImageUrl(imageUrl);
    } catch {
      alert('URL ảnh không hợp lệ');
    }
  };

  const handleAddEventTemplate = () => {
    const today = new Date().toLocaleDateString('vi-VN');
    const template = `📅 Sự kiện/Workshop (${today}): `;

    setNewPostContent((prev) => {
      if (prev.includes('📅 Sự kiện/Workshop')) return prev;
      return `${prev}${prev.trim() ? '\n\n' : ''}${template}`;
    });
  };

  const loadComments = useCallback(async (postId: string) => {
    if (loadingCommentsRef.current[postId]) return;
    setLoadingComments((prev) => ({ ...prev, [postId]: true }));
    try {
      const res = await apiFetch(`posts/${postId}/comments`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Không thể tải bình luận');
      const comments = Array.isArray(data?.comments) ? data.comments as Comment[] : [];
      const order: CommentOrder = data?.order === 'desc' ? 'desc' : 'asc';
      setCommentsByPost((prev) => ({ ...prev, [postId]: comments }));
      setCommentOrderByPost((prev) => ({ ...prev, [postId]: order }));
      setPosts((prev) => prev.map((post) => post.id === postId ? { ...post, comments: comments.length } : post));
    } catch {
      setCommentsByPost((prev) => ({ ...prev, [postId]: [] }));
    } finally {
      setLoadingComments((prev) => ({ ...prev, [postId]: false }));
    }
  }, []);

  const handleToggleComments = (postId: string) => {
    const willExpand = !expandedComments[postId];
    setExpandedComments((prev) => ({ ...prev, [postId]: willExpand }));
    if (willExpand && commentsByPost[postId] === undefined) {
      void loadComments(postId);
    }
  };

  const handleCommentSubmit = async (postId: string) => {
    if (!user) {
      onLoginRequest();
      return;
    }

    const content = (commentInputs[postId] ?? '').trim();
    if (!content || postingComment[postId]) return;

    setPostingComment((prev) => ({ ...prev, [postId]: true }));
    try {
      const res = await apiFetch(`posts/${postId}/comments`, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Không thể gửi bình luận');

      const newComment = data?.comment as Comment | undefined;
      if (!newComment) return;

      setCommentsByPost((prev) => {
        const current = prev[postId] ?? [];
        const order = commentOrderByPostRef.current[postId] ?? 'asc';
        return { ...prev, [postId]: insertCommentByOrder(current, newComment, order) };
      });
      setPosts((prev) => prev.map((post) => post.id === postId ? { ...post, comments: post.comments + 1 } : post));
      setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
    } catch (e: any) {
      alert(e?.message ?? 'Có lỗi xảy ra khi gửi bình luận');
    } finally {
      setPostingComment((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const handleShare = async (postId: string) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?post=${postId}`;
    const shareText = 'Xem bài đăng thảo luận nông nghiệp xanh này';

    try {
      if (navigator.share) {
        await navigator.share({ title: 'Eco Product - Bài thảo luận', text: shareText, url: shareUrl });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }

      setShareFeedback((prev) => ({ ...prev, [postId]: 'Đã chia sẻ' }));
      window.setTimeout(() => {
        setShareFeedback((prev) => ({ ...prev, [postId]: '' }));
      }, 2000);
    } catch {
      setShareFeedback((prev) => ({ ...prev, [postId]: 'Không thể chia sẻ' }));
      window.setTimeout(() => {
        setShareFeedback((prev) => ({ ...prev, [postId]: '' }));
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 select-none">

      {/* Banner / Header Area */}
      <div className="bg-white border-b border-slate-200">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Cộng Đồng Nông Nghiệp Xanh</h1>
          <p className="text-slate-500 max-w-2xl">
            Nơi chia sẻ kiến thức, kết nối đam mê và cùng nhau hành động vì một nền nông nghiệp bền vững.
          </p>

          {/* Tabs */}
          <div className="flex items-center gap-6 mt-8">
            <button
              onClick={() => setActiveTab('feed')}
              className={`pb-3 text-sm font-semibold transition-all border-b-2 ${activeTab === 'feed' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              Thảo luận
            </button>
            <button
              onClick={() => setActiveTab('events')}
              className={`pb-3 text-sm font-semibold transition-all border-b-2 ${activeTab === 'events' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              Sự kiện & Workshop
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Main Content Stream */}
        <div className="lg:col-span-2 space-y-6">

          {/* Create Post Input (Only visible in Feed) */}
          {activeTab === 'feed' && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                  {/* Avatar Placeholder */}
                  <Users size={20} className="text-slate-400" />
                </div>
                <div className="flex-1">
                  <textarea
                    placeholder={user ? `Bạn đang nghĩ gì, ${user.name}?` : "Đăng nhập để chia sẻ ý kiến..."}
                    className="w-full bg-slate-50 rounded-xl p-3 text-sm border-none focus:ring-2 focus:ring-emerald-500/20 outline-none resize-none"
                    rows={2}
                    value={newPostContent}
                    onChange={(e) => setNewPostContent(e.target.value)}
                    disabled={!user}
                  />
                  {newPostImageUrl && (
                    <div className="mt-3 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                      <img src={newPostImageUrl} alt="Ảnh xem trước" className="w-full max-h-64 object-cover" loading="lazy" />
                      <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-500">
                        <span className="truncate">Đã đính kèm ảnh</span>
                        <button
                          type="button"
                          onClick={() => setNewPostImageUrl('')}
                          className="text-slate-500 hover:text-red-500 transition-colors"
                        >
                          Gỡ ảnh
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddImage}
                        className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-full transition-colors"
                        title="Thêm ảnh"
                        type="button"
                      >
                        <ImageIcon size={20} />
                      </button>
                      <button
                        onClick={handleAddEventTemplate}
                        className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-full transition-colors"
                        title="Thêm sự kiện"
                        type="button"
                      >
                        <Calendar size={20} />
                      </button>
                    </div>
                    <button
                      onClick={handlePost}
                      disabled={!newPostContent.trim()}
                      className="bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
                    >
                      <Send size={16} /> Đăng bài
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Feed Content */}
          <AnimatePresence mode="wait">
            {activeTab === 'feed' ? (
              <motion.div
                key="feed-list"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {posts.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onLike={() => handleLike(post.id)}
                    onToggleComments={() => handleToggleComments(post.id)}
                    comments={commentsByPost[post.id] ?? []}
                    commentsExpanded={Boolean(expandedComments[post.id])}
                    commentsLoading={Boolean(loadingComments[post.id])}
                    commentValue={commentInputs[post.id] ?? ''}
                    onCommentValueChange={(value) => setCommentInputs((prev) => ({ ...prev, [post.id]: value }))}
                    onCommentSubmit={() => handleCommentSubmit(post.id)}
                    commentSubmitting={Boolean(postingComment[post.id])}
                    onShare={() => handleShare(post.id)}
                    shareMessage={shareFeedback[post.id] ?? ''}
                    canComment={Boolean(user)}
                    onLoginRequest={onLoginRequest}
                  />
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="event-list"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {events.map(event => (
                  <EventCard key={event.id} event={event} onRSVP={() => handleRSVP(event.id)} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sidebar (Desktop) */}
        <div className="hidden lg:block space-y-6">

          {/* Trending Topics */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 sticky top-24">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-emerald-500 rounded-full"></span>
              Chủ đề nổi bật
            </h3>
            <div className="space-y-3">
              {trendingTopics.slice(0, TRENDING_TOPICS_LIMIT).map((topic) => (
                <div key={topic.tag} className="flex items-center justify-between group cursor-pointer">
                  <span className="text-slate-600 font-medium group-hover:text-emerald-600 transition-colors">{topic.tag}</span>
                  <span className="text-xs text-slate-400">{topic.label}</span>
                </div>
              ))}
            </div>

            <hr className="my-6 border-slate-100" />

            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-blue-500 rounded-full"></span>
              Thành viên tích cực
            </h3>
            <div className="flex -space-x-2 overflow-hidden mb-4">
              {activeMembers.slice(0, 5).map((member) => (
                <div key={member.name} className="h-8 w-8 rounded-full ring-2 ring-white bg-slate-200 flex items-center justify-center text-xs text-slate-600 font-bold" title={member.name}>
                  {member.initials}
                </div>
              ))}
              {activeMembers.length > 5 && (
                <div className="h-8 w-8 rounded-full ring-2 ring-white bg-slate-100 flex items-center justify-center text-xs text-slate-500 font-bold">
                  +{activeMembers.length - 5}
                </div>
              )}
            </div>
            <div className="space-y-2">
              {activeMembers.slice(0, 4).map((member) => (
                <div key={`${member.name}-stat`} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">{member.name}</span>
                  <span className="text-slate-400">{member.posts > 0 ? `${member.posts} bài viết` : 'User mẫu'}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-4">Tham gia cùng hàng ngàn chuyên gia và nông dân khác.</p>
          </div>

        </div>
      </div>
    </div>
  );
};

// --- Sub-components ---

interface PostCardProps {
  post: Post;
  onLike: () => void;
  onToggleComments: () => void;
  comments: Comment[];
  commentsExpanded: boolean;
  commentsLoading: boolean;
  commentValue: string;
  onCommentValueChange: (value: string) => void;
  onCommentSubmit: () => void;
  commentSubmitting: boolean;
  onShare: () => void;
  shareMessage: string;
  canComment: boolean;
  onLoginRequest: () => void;
}

const PostCard: React.FC<PostCardProps> = ({
  post,
  onLike,
  onToggleComments,
  comments,
  commentsExpanded,
  commentsLoading,
  commentValue,
  onCommentValueChange,
  onCommentSubmit,
  commentSubmitting,
  onShare,
  shareMessage,
  canComment,
  onLoginRequest,
}) => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-100 to-blue-100 flex items-center justify-center text-emerald-700 font-bold">
              {post.user_name.charAt(0)}
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 text-sm">{post.user_name}</h4>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>{post.timestamp}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><MapPin size={10} /> Việt Nam</span>
              </div>
            </div>
          </div>
          <button className="text-slate-400 hover:text-slate-600" aria-label="Tùy chọn" title="Tùy chọn">
            <MoreHorizontal size={20} />
          </button>
        </div>

        {/* Content */}
        <p className="text-slate-800 text-sm leading-relaxed mb-3 whitespace-pre-wrap">
          {post.content}
        </p>

        {/* Tags */}
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {post.tags.map(tag => (
              <span key={tag} className="text-emerald-600 text-xs font-medium hover:underline cursor-pointer">{tag}</span>
            ))}
          </div>
        )}

        {/* Image */}
        {post.image && (
          <div className="rounded-xl overflow-hidden mb-3 border border-slate-100">
            <img src={post.image} alt="Post content" className="w-full h-auto object-cover max-h-96" loading="lazy" />
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center justify-between text-xs text-slate-500 py-2 border-t border-slate-50 mt-2">
          <div className="flex items-center gap-1">
            <div className="bg-blue-500 p-1 rounded-full text-white"><ThumbsUp size={10} /></div>
            <span>{post.likes} người thích</span>
          </div>
          <span>{post.comments} bình luận</span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2 mt-1">
          <button
            onClick={onLike}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${post.is_liked ? 'text-red-500 bg-red-50' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Heart size={18} fill={post.is_liked ? "currentColor" : "none"} />
            Thích
          </button>
          <button
            onClick={onToggleComments}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${commentsExpanded ? 'text-emerald-600 bg-emerald-50' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <MessageCircle size={18} />
            Bình luận
          </button>
          <button
            onClick={onShare}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Share2 size={18} />
            Chia sẻ
          </button>
        </div>

        {shareMessage && (
          <div className="text-xs text-emerald-600 mt-2">{shareMessage}</div>
        )}

        {commentsExpanded && (
          <div className="border-t border-slate-100 mt-3 pt-3 space-y-3">
            {commentsLoading ? (
              <p className="text-xs text-slate-500">Đang tải bình luận...</p>
            ) : comments.length > 0 ? (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {comments.map((comment) => (
                  <div key={comment.id} className="bg-slate-50 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-700">{comment.user_name}</span>
                      <span className="text-[11px] text-slate-400">{comment.timestamp}</span>
                    </div>
                    <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{comment.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Chưa có bình luận nào.</p>
            )}

            <div className="flex items-end gap-2">
              <textarea
                className="flex-1 bg-slate-50 rounded-lg p-2 text-sm border-none focus:ring-2 focus:ring-emerald-500/20 outline-none resize-none"
                rows={2}
                placeholder={canComment ? 'Viết bình luận của bạn...' : 'Đăng nhập để bình luận...'}
                value={commentValue}
                onChange={(e) => onCommentValueChange(e.target.value)}
                disabled={!canComment}
              />
              <button
                onClick={canComment ? onCommentSubmit : onLoginRequest}
                disabled={canComment ? (!commentValue.trim() || commentSubmitting) : false}
                className="bg-emerald-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {canComment ? (commentSubmitting ? 'Đang gửi...' : 'Gửi') : 'Đăng nhập'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const EventCard: React.FC<{ event: Event, onRSVP: () => void }> = ({ event, onRSVP }) => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col sm:flex-row">
      {/* Date Badge (Mobile) */}
      <div className="sm:hidden bg-emerald-50 p-3 flex items-center gap-3 border-b border-emerald-100">
        <div className="font-bold text-emerald-700">{event.date} {event.month}</div>
        <div className="h-4 w-px bg-emerald-200"></div>
        <div className="text-sm text-emerald-800 font-medium truncate">{event.title}</div>
      </div>

      {/* Image */}
      <div className="sm:w-48 h-48 sm:h-auto relative shrink-0">
        <img src={event.image} alt={event.title} className="w-full h-full object-cover" loading="lazy" />
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-t from-black/60 to-transparent sm:hidden"></div>
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col flex-1">
        <div className="flex justify-between items-start mb-2">
          <div>
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1 block">{event.month}</span>
            <h3 className="text-lg font-bold text-slate-900 leading-tight mb-2">{event.title}</h3>
          </div>
          {/* Desktop Date Badge */}
          <div className="hidden sm:flex flex-col items-center justify-center bg-slate-100 rounded-lg p-2 min-w-[60px]">
            <span className="text-xl font-bold text-slate-900">{event.date}</span>
            <span className="text-xs font-bold text-slate-500 uppercase">{event.month}</span>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Clock size={16} className="text-slate-400" />
            {event.time}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <MapPin size={16} className="text-slate-400" />
            {event.location}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Users size={16} className="text-slate-400" />
            {event.attendees} người sẽ tham gia
          </div>
        </div>

        <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Tổ chức bởi <span className="font-semibold text-slate-700">{event.organizer}</span>
          </div>
          <button
            onClick={onRSVP}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all shadow-sm flex items-center gap-2 ${event.is_going
              ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
              : 'bg-slate-900 text-white hover:bg-emerald-600'
              }`}
          >
            {event.is_going ? <><CheckCircle2 size={16} /> Đã đăng ký</> : 'Tham gia'}
          </button>
        </div>
      </div>
    </div>
  );
};
