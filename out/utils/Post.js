"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const mongoose_2 = __importDefault(require("mongoose"));
const messageSchema = new mongoose_1.Schema({
    to: String,
    from: String,
    roomId: String,
    content: String,
});
const userSchema = new mongoose_1.Schema({
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
        type: [mongoose_2.default.SchemaTypes.ObjectId],
        ref: "User"
    },
    followersCount: {
        type: Number,
        default: 0,
    },
    followerUsers: {
        type: [mongoose_2.default.SchemaTypes.ObjectId],
        ref: "User"
    },
    friendUsers: {
        type: [mongoose_2.default.SchemaTypes.ObjectId],
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
    posts: {
        type: [mongoose_2.default.SchemaTypes.ObjectId],
        default: []
    },
    pendingMessages: {
        type: [mongoose_2.default.SchemaTypes.ObjectId],
        ref: "Message"
    }
});
const User = mongoose_1.models.User || (0, mongoose_1.model)("User", userSchema);
const Message = mongoose_1.models.Message || (0, mongoose_1.model)("Message", messageSchema);
exports.default = User;
