"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const crypto_1 = __importDefault(require("crypto"));
const User_1 = __importDefault(require("./utils/User"));
const Message_1 = __importDefault(require("./utils/Message"));
const Notification_1 = __importDefault(require("./utils/Notification"));
const mongoose_1 = __importDefault(require("mongoose"));
//setup dotenv
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const mongoURI = "mongodb://127.0.0.1:27017/instagram";
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*",
        methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    }
});
app.get("/", (req, res) => {
    res.send("ok");
});
const connectedUsers = new Set();
const rooms = new Set();
io.on("connection", (socket) => {
    console.log("a user connected");
    socket.on("subscribe", (payload) => {
        const user = {
            username: payload.username,
            socket: socket,
        };
        connectedUsers.add(user);
        console.log(`${payload.username} subscribed`);
        // console.log(connectedUsers);
    });
    socket.on("createRoom", (payload) => {
        let { members } = payload;
        console.log("members = ", members);
        if (members.length < 2) {
            socket.emit("roomCreateError", { status: "error", message: "not enough members" });
        }
        else {
            //get all member sockets
            const memberSockets = members.map(member => {
                const memberSocket = findFromSet((user) => { return user.username == member; }, connectedUsers);
                return memberSocket;
            });
            //check all connected;
            const allConnected = members.filter(member => {
                return findFromSet((user) => { return user.username == member; }, connectedUsers) !== undefined;
            }).length == members.length;
            const roomId = sha256(members.join("") + (new Date().getTime()));
            if (allConnected) {
                const room = {
                    members: memberSockets,
                    roomId: roomId,
                };
                rooms.add(room);
                console.log(rooms);
                emitAll("roomCreated", { status: "success", roomId: roomId, members: members }, room);
            }
        }
    });
    socket.on("joinRooms", (payload) => {
        const roomsToBeConnected = findMultipleFromSet((room) => { return payload.roomIds.includes(room.roomId); }, rooms);
        if (roomsToBeConnected) {
            roomsToBeConnected.forEach(room => {
                const members = room.members.map(member => member.username);
                if (!members.includes(payload.username)) {
                    console.log(`${payload.username} joined ${room.roomId}`);
                    room.members.push({ username: payload.username, socket: socket });
                    socket.emit("roomCreated", { status: "success", roomId: room.roomId, members: members });
                }
            });
        }
    });
    socket.on("message", (payload) => {
        const { roomId, to, from, message } = payload;
        console.log("message payload = ", payload);
        const room = findFromSet((room) => { return room.roomId == roomId; }, rooms);
        if (room) {
            const recieverConnected = findFromSet((user) => { return user.username == to; }, connectedUsers) !== undefined;
            if (recieverConnected) {
                emitAll("newMessage", payload, room);
            }
            else {
                mongoose_1.default.connect(mongoURI).then(() => {
                    const newMessage = new Message_1.default();
                    newMessage.to = to;
                    newMessage.from = from;
                    newMessage.roomId = roomId;
                    newMessage.content = message;
                    newMessage.save().then(() => {
                        User_1.default.findOne({ username: to }).then((user) => {
                            user.pendingMessages.push(newMessage._id);
                            user.save();
                        });
                    });
                });
                emitAll("newMessage", payload, room);
            }
        }
        else {
            socket.emit("Message Error", { status: "error", message: "room not found" });
        }
    });
    socket.on("disconnect", () => {
        const delThis = findFromSet((user) => { return user.socket === socket; }, connectedUsers);
        const connectedRooms = findMultipleFromSet((room) => {
            try {
                const mappedMembers = room.members.map(member => { return member.socket; });
                return mappedMembers.includes(socket);
            }
            catch (err) {
                return false;
            }
        }, rooms);
        connectedRooms.forEach(connectedRoom => {
            // emitAll("roomDissolved", { roomId: connectedRoom.roomId }, connectedRoom);
            // rooms.delete(connectedRoom);
            connectedRoom.members = connectedRoom.members.filter(member => {
                return member.socket !== socket;
            });
        });
        if (delThis) {
            connectedUsers.delete(delThis);
        }
    });
    socket.on("spawnFollowNotification", (payload) => {
        const { to, from } = payload;
        const user = findFromSet((user) => { return user.username == to; }, connectedUsers);
        if (user) {
            user.socket.emit("newFollow", { from: from });
        }
        else {
            mongoose_1.default.connect(mongoURI).then(() => {
                const newNotification = new Notification_1.default();
                newNotification.to = to;
                newNotification.from = from;
                newNotification.type = "follow";
                newNotification.save().then(() => {
                    User_1.default.findOne({ username: to }).then((user) => {
                        user.pendingNotifications.push(newNotification._id);
                        user.save();
                    });
                });
            });
        }
    });
    socket.on("spawnUnFollowNotification", (payload) => {
        const { to, from } = payload;
        const user = findFromSet((user) => { return user.username == to; }, connectedUsers);
        if (user) {
            user.socket.emit("newUnFollow", { from: from });
        }
        else {
            mongoose_1.default.connect(mongoURI).then(() => {
                const newNotification = new Notification_1.default();
                newNotification.to = to;
                newNotification.from = from;
                newNotification.type = "unFollow";
                newNotification.save().then(() => {
                    User_1.default.findOne({ username: to }).then((user) => {
                        user.pendingNotifications.push(newNotification._id);
                        user.save();
                    });
                });
            });
        }
    });
});
httpServer.listen(4000);
function findFromSet(callback, set) {
    const iterable = set.values();
    for (const el of iterable) {
        if (callback(el)) {
            return el;
        }
    }
    return undefined;
}
function findMultipleFromSet(callback, set) {
    const iterable = set.values();
    const retArr = [];
    for (const el of iterable) {
        if (callback(el)) {
            retArr.push(el);
        }
    }
    return retArr;
}
function emitAll(event, message, room) {
    room.members.forEach(member => {
        console.log("emmitting for ", member.username);
        member.socket.emit(event, message);
    });
}
//sha-256 fucntion
function sha256(data) {
    //@ts-ignore
    const hash = crypto_1.default.createHash("sha256");
    hash.update(data);
    return hash.digest("hex");
}