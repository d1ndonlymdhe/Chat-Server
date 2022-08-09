export interface user {
    username: string;
    password?: string;
    followingCount: number;
    followingUsers: { username: string }[];
    followersCount: number;
    followerUsers: { username: string }[];
    friendsCount: number;
    friendUsers: { username: string }[];
    firstLogin: boolean;
    hash: string;
    bio?: string;
    _id: string;
    posts: { posts: posts }[];
    pendingMessages: message[];
    pendingNotifications: notification[];
    save: () => void
}

export interface message {
    to: string;
    from: string;
    content: string;
    roomId: string;
    save: () => void;
}

export interface notification {
    type: string;
    to: string;
    from: string;
    save: () => void;
}

export interface post {
    caption: string;
    likes: number;
    likedBy: string[];
    likedByUsernames: string[];
    postedBy: { username: string }[];
    uploader: user;
    postedByUsername: string;
    postedOn: number;
    _id: string;
    save: () => void
}

export interface updateUserOptionsType {
    following?: number;
    followersCount?: number;
    password?: string;
    newUsername?: string;
    hash?: string;
    bio?: string;
    firstLogin?: boolean;
}