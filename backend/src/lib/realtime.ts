export type CommunityRealtimeEvent =
    | {
        type: 'post_created';
        postId: string;
        createdAt: string;
    }
    | {
        type: 'comment_created';
        postId: string;
        commentCount: number;
        comment: {
            id: string;
            user_name: string;
            content: string;
            timestamp: string;
            created_at: string;
        };
        createdAt: string;
    }
    | {
        type: 'like_changed';
        postId: string;
        likeCount: number;
        createdAt: string;
    };

type Listener = (event: CommunityRealtimeEvent) => void;

const listeners = new Map<number, Listener>();
let nextListenerId = 1;

export function subscribeCommunityEvents(listener: Listener): () => void {
    const id = nextListenerId++;
    listeners.set(id, listener);
    return () => {
        listeners.delete(id);
    };
}

export function publishCommunityEvent(event: CommunityRealtimeEvent) {
    for (const listener of listeners.values()) {
        try {
            listener(event);
        } catch {
            // ignore subscriber errors to keep fan-out healthy
        }
    }
}
