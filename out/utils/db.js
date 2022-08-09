"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.newPost = exports.newUser = exports.updateUser = exports.findUser = exports.connect = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("./User"));
const Post_1 = __importDefault(require("./Post"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const MONGO_URI = process.env.MONGO_URI;
const connect = () => { return mongoose_1.default.connect(MONGO_URI); };
exports.connect = connect;
const findUser = async (username, hash) => {
    const user = (0, exports.connect)().then(async () => {
        if (username !== undefined) {
            const user = await User_1.default.findOne({ username: username });
            return user;
        }
        else if (hash !== undefined) {
            const user = await User_1.default.findOne({ hash: hash });
            return user;
        }
    });
    return user;
};
exports.findUser = findUser;
function updateUser(username, options) {
    (0, exports.connect)().then(async () => {
        await updateuser(username, options);
    });
}
exports.updateUser = updateUser;
async function newUser(username, password) {
    const user = (0, exports.connect)().then(async () => {
        const user = new User_1.default({ username: username, password: password });
        await user.save();
        return user;
    });
    return user;
}
exports.newUser = newUser;
async function newPost(postedBy, postedOn, caption) {
    const connection = await (0, exports.connect)();
    const post = new Post_1.default({ caption: caption || "", postedBy: postedBy, postedOn: postedOn });
    await post.save();
    return post;
}
exports.newPost = newPost;
async function updateuser(username, options) {
    const { following, followersCount, password, newUsername, hash, bio, firstLogin } = options;
    const user = await User_1.default.findOne({ username: username });
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
    await user.save();
}
