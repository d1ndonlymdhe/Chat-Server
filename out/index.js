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
        const isAlreadySubscribed = findFromSet(user => user.username === payload.username, connectedUsers);
        if (isAlreadySubscribed) {
            isAlreadySubscribed.sockets.push(socket);
            console.log(`${payload.username} subscribed again`);
            console.log("hello");
            const connectedRooms = findMultipleFromSet((room) => {
                try {
                    const members = room.members;
                    return members.some(member => member.sockets.includes(socket));
                }
                catch (err) {
                    return false;
                }
            }, rooms);
            const connectedRoomIds = connectedRooms.map(room => room.roomId);
            console.log("join These rooms", connectedRoomIds);
            socket.emit("already subscribed", { joinThese: connectedRoomIds });
        }
        else {
            connectedUsers.add({ username: payload.username, sockets: [socket] });
            console.log(`${payload.username} subscribed`);
        }
        // console.log(connectedUsers);
    });
    socket.on("createRoom", (payload) => {
        let { self, reciever } = payload;
        const members = [self, reciever];
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
            const roomWithMembersAlreadyExists = findFromSet((room) => {
                return JSON.stringify(room.members.map(m => m.username)) === JSON.stringify(members);
            }, rooms);
            const roomId = sha256(members.join("") + (new Date().getTime()));
            if (allConnected) {
                if (!roomWithMembersAlreadyExists) {
                    const room = {
                        members: memberSockets,
                        roomId: roomId,
                    };
                    rooms.add(room);
                    console.log(rooms);
                    emitAll("roomCreated", { status: "success", roomId: roomId, members: members }, room);
                }
            }
            else {
                const room = {
                    members: [{ username: self, sockets: [socket] }],
                    roomId: roomId,
                };
                rooms.add(room);
                console.log(rooms);
                socket.emit("roomCreated", { status: "success", roomId: roomId, members: members });
                mongoose_1.default.connect(mongoURI).then(() => {
                    const newMessage = new Message_1.default();
                    newMessage.to = reciever;
                    newMessage.from = self;
                    newMessage.roomId = roomId;
                    newMessage.content = `room created while ${reciever} was offline`;
                    newMessage.save().then(() => {
                        User_1.default.findOne({ username: reciever }).then((user) => {
                            user.pendingMessages.push(newMessage._id);
                            user.save();
                        });
                    });
                });
                // socket.emit("room creation error", { message: `${reciever} not connected` })
            }
        }
    });
    socket.on("joinRooms", (payload) => {
        const roomsToBeConnected = findMultipleFromSet((room) => { return payload.roomIds.includes(room.roomId); }, rooms);
        if (roomsToBeConnected) {
            roomsToBeConnected.forEach(room => {
                console.log(room);
                const members = room.members.map(member => member.username);
                if (!members.includes(payload.username)) {
                    console.log(`${payload.username} joined ${room.roomId}`);
                    room.members.push({ username: payload.username, sockets: [socket] });
                    console.log({ status: "success", roomId: room.roomId, members: members });
                    socket.emit("roomCreated", { status: "success", roomId: room.roomId, members: members });
                }
                else {
                    // const member = findFromSet<userSocket>((user) => { return user.username == payload.username }, room.members)!;
                    const member = room.members.find(member => member.username === payload.username);
                    const updatedSockets = findFromSet((user) => { return user.username == payload.username; }, connectedUsers);
                    const tempMembers = [];
                    for (let i = 0; i < room.members.length; i++) {
                        if (room.members[i].username !== payload.username) {
                            tempMembers.push(room.members[i]);
                        }
                    }
                    tempMembers.push(updatedSockets);
                    room.members = tempMembers;
                    const members = room.members.map(member => member.username);
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
                const user = findFromSet((user) => { return user.username == from; }, connectedUsers);
                user?.sockets.forEach(socket => {
                    socket.emit("newMessage", payload);
                });
            }
        }
        else {
            socket.emit("Message Error", { status: "error", message: "room not found" });
        }
    });
    socket.on("disconnect", () => {
        console.log("disconnected");
        const user = findFromSet((user) => { return user.sockets.includes(socket); }, connectedUsers);
        if (user) {
            if (user.sockets.length > 1) {
                user.sockets = user.sockets.filter(s => s !== socket);
            }
            else {
                const connectedRooms = findMultipleFromSet((room) => {
                    try {
                        const members = room.members;
                        return members.some(member => member.sockets.includes(socket));
                    }
                    catch (err) {
                        return false;
                    }
                }, rooms);
                connectedRooms.forEach(connectedRoom => {
                    connectedRoom.members = connectedRoom.members.filter(member => {
                        return !member.sockets.some(s => s === socket);
                    });
                });
            }
            connectedUsers.delete(user);
        }
    });
});
httpServer.listen(4000);
function deepIncludes(arr, item) {
    let length = arr.length;
    for (let i = 0; i < length; i++) {
        if (JSON.stringify(arr[i]) === JSON.stringify(item)) {
            return true;
        }
    }
    return false;
}
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
        member.sockets.forEach(socket => {
            socket.emit(event, message);
        });
    });
}
//sha-256 fucntion
function sha256(data) {
    //@ts-ignore
    const hash = crypto_1.default.createHash("sha256");
    hash.update(data);
    return hash.digest("hex");
}
