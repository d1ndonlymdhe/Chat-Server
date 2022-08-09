import { Schema, model, models } from "mongoose";
import mongoose from "mongoose";
const messageSchema = new Schema({
    to: String,
    from: String,
    roomId: String,
    content: String,
})
const userSchema = new Schema({
    username: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    followingCount: {
        type: Number,
        default: 0,
    },
    followingUsers: {
        type: [mongoose.SchemaTypes.ObjectId],
        ref: "User"
    },
    followersCount: {
        type: Number,
        default: 0,
    },
    followerUsers: {
        type: [mongoose.SchemaTypes.ObjectId],
        ref: "User"
    },
    friendUsers: {
        type: [mongoose.SchemaTypes.ObjectId],
        ref: "User"
    },
    friendsCount: {
        type: String,
        default: 0
    },
    firstLogin: {
        type: Boolean,
        default: true
    },
    hash: {
        type: String,
    },
    bio: {
        type: String,
        default: ""
    },
    posts: [mongoose.SchemaTypes.ObjectId],
    pendingMessages: {
        type: [mongoose.SchemaTypes.ObjectId],
        ref: "Message"
    },
    pendingNotifications: {
        type: [mongoose.SchemaTypes.ObjectId],
        ref: "Notification"
    }
})


const User = models.User || model("User", userSchema);

export default User;