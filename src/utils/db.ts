import mongoose from "mongoose";
import User from "./User";
import { post, user, updateUserOptionsType } from "./type";
import Post from "./Post";
import dotenv from "dotenv";
dotenv.config();
const MONGO_URI = process.env.MONGO_URI!;
export const connect = () => { return mongoose.connect(MONGO_URI) };
export const findUser = async (username?: string, hash?: string) => {
    const user = connect().then(async () => {
        if (username !== undefined) {
            const user = await User.findOne({ username: username }) as user;
            return user;
        } else if (hash !== undefined) {
            const user = await User.findOne({ hash: hash }) as user;
            return user;
        }
    })
    return user;
}

export function updateUser(username: string, options: updateUserOptionsType) {
    connect().then(async () => {
        await updateuser(username, options);
    })
}

export async function newUser(username: string, password: string) {
    const user = connect().then(async () => {
        const user = new User({ username: username, password: password }) as user;
        await user.save();
        return user;
    })
    return user;
}

export async function newPost(postedBy: string, postedOn: number, caption?: string) {
    const connection = await connect();
    const post = new Post({ caption: caption || "", postedBy: postedBy, postedOn: postedOn }) as post;
    await post.save();
    return post;
}

async function updateuser(username: string, options: updateUserOptionsType) {
    const { following, followersCount, password, newUsername, hash, bio, firstLogin } = options
    const user = await User.findOne({ username: username });
    if (following !== undefined) {
        user.following = following;
    }
    if (followersCount !== undefined) {
        user.followersCount = followersCount;
    }
    if (password !== undefined) {
        user.password = password;
    }
    if (newUsername !== undefined) {
        user.username = newUsername;
    }
    if (hash !== undefined) {
        user.hash = hash;
    }
    if (bio !== undefined) {
        user.bio = bio;
    }
    if (firstLogin !== undefined) {
        user.firstLogin = firstLogin;
    }
    await user.save()
}

