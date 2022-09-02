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
    res.send("Ok");
});
let users = [];
let rooms = [];
let connectedSockets = [];
io.on("connection", (socket) => {
    console.log("New Conection");
    socket.on("subscribe", (payload) => {
        const { username } = payload;
        const user = { username, socketId: socket.id };
        users.push(user);
        connectedSockets.push(socket);
        const userAlreadyExists = checkDuplicateInArr(user, users);
        if (userAlreadyExists) {
            console.log(username + " subscribed again");
            //find connected rooms
            const roomIdsToBeConnected = [];
            const numberOfRooms = rooms.length;
            for (let i = 0; i < numberOfRooms; i++) {
                if (existsInArr(user.username, rooms[i].members)) {
                    roomIdsToBeConnected.push(rooms[i].id);
                }
            }
            console.log("Join These Rooms ", roomIdsToBeConnected);
            socket.emit("already subscribed", { joinThese: roomIdsToBeConnected });
        }
        else {
            console.log(username + " subscribed");
            console.log("users = ", users);
        }
    });
    socket.on("createRoom", (payload) => {
        let { self, reciever } = payload;
        const members = [self, reciever];
        if (!self || !reciever) {
            socket.emit("roomCreateError", { status: "error", message: "not enougn members" });
        }
        else {
            const socketsToAdd = [];
            const numberOfUsers = users.length;
            for (let i = 0; i < numberOfUsers; i++) {
                if (users[i].username === self || users[i].username === reciever) {
                    const numberOfSockets = connectedSockets.length;
                    const userSocketId = users[i].socketId;
                    for (let j = 0; j < numberOfSockets; j++) {
                        if (connectedSockets[j].id === userSocketId) {
                            socketsToAdd.push(connectedSockets[j]);
                        }
                    }
                }
            }
            //if the reciever is connected
            if (existsInArr(reciever, users.map(user => user.username))) {
                console.log("normal room creation");
                const room = {
                    members: [self, reciever],
                    id: sha256(members.join("") + (new Date().getTime()))
                };
                rooms.push(room);
                console.log("Created Room = ", room);
                socket.join(room.id);
                socketsToAdd.forEach(socket => {
                    socket.join(room.id);
                });
                socket.to(room.id).emit("roomCreated", { status: "success", roomId: room.id, members: [self, reciever] });
                socket.emit("roomCreated", { status: "success", roomId: room.id, members: [self, reciever] });
            }
            else {
                console.log("special room creation");
                const room = {
                    members: [self, reciever],
                    id: sha256(self + reciever + (new Date().getTime()))
                };
                rooms.push(room);
                socket.join(room.id);
                socket.emit("roomCreated", { status: "success", roomId: room.id, members: [self, reciever] });
                console.log("room created while reciever was offline");
                console.log("Created Room = ", room);
                mongoose_1.default.connect(mongoURI).then(() => {
                    const newMessage = new Message_1.default();
                    newMessage.to = reciever;
                    newMessage.from = self;
                    newMessage.roomId = room.id;
                    newMessage.content = `room created while ${reciever} was offline`;
                    newMessage.save().then(() => {
                        User_1.default.findOne({ username: reciever }).then((user) => {
                            user.pendingMessages.push(newMessage._id);
                            user.save();
                        });
                    });
                });
            }
        }
    });
    socket.on("joinRooms", (payload) => {
        const { roomIds, username } = payload;
        const roomsToBeConnected = [];
        const numberOfRooms = rooms.length;
        for (let i = 0; i < numberOfRooms; i++) {
            //rooms itself is mutated
            const room = rooms[i];
            if (existsInArr(room.id, roomIds)) {
                room.members.push(username);
                socket.join(room.id);
                //client expects just two members so need to remove duplicates and send
                socket.emit("roomCreated", { status: "success", roomId: room.id, members: removeAllDuplicates(room.members) });
                roomsToBeConnected.push(room);
            }
        }
    });
    socket.on("message", (payload) => {
        const { roomId, to, from, message } = payload;
        const roomExists = existsInArr(roomId, rooms.map(room => room.id));
        if (roomExists) {
            const recieverConnected = existsInArr(to, users.map(user => user.username));
            if (recieverConnected) {
                console.log("Normal Message");
                socket.emit("newMessage", payload);
                socket.to(roomId).emit("newMessage", payload);
            }
            else {
                console.log("Write message to Database");
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
                socket.to(roomId).emit("newMessage", payload);
                socket.emit("newMessage", payload);
            }
        }
    });
    socket.on("disconnect", () => {
        let user = undefined;
        const numberOfUsers = users.length;
        for (let i = 0; i < numberOfUsers; i++) {
            if (users[i].socketId == socket.id) {
                user = users[i];
                break;
            }
        }
        const numberOfConnectedSockets = connectedSockets.length;
        const tempSockets = [];
        for (let i = 0; i < numberOfConnectedSockets; i++) {
            if (connectedSockets[i].id != socket.id) {
                tempSockets.push(connectedSockets[i]);
            }
            else {
                continue;
            }
        }
        connectedSockets = tempSockets;
        if (user) {
            const numberOfRooms = rooms.length;
            const tempUsers = [];
            for (let i = 0; i < users.length; i++) {
                const innerUser = users[i];
                if (user.username != innerUser.username && user.socketId != innerUser.socketId) {
                    tempUsers.push(innerUser);
                }
                users = tempUsers;
            }
            users = removeFromArr(user, users);
            for (let i = 0; i < numberOfRooms; i++) {
                if (existsInArr(user.username, rooms[i].members)) {
                    rooms[i].members = removeFromArr(user.username, rooms[i].members);
                }
            }
            console.log(`${user.username} disconnected`);
            console.log("updated users array = ", users);
        }
    });
});
httpServer.listen(4000);
function checkDuplicateInArr(e, arr) {
    const length = arr.length;
    let counter = 0;
    if (typeof e == "object") {
        for (let i = 0; i < length; i++) {
            if (JSON.stringify(e) === JSON.stringify(arr[i])) {
                counter++;
                if (counter === 2) {
                    return true;
                }
            }
        }
    }
    else {
        for (let i = 0; i < length; i++) {
            if (e === arr[i]) {
                counter++;
                if (counter === 2) {
                    return true;
                }
            }
        }
    }
    return false;
}
function existsInArr(e, arr) {
    const length = arr.length;
    if (typeof e == "object") {
        for (let i = 0; i < length; i++) {
            if (JSON.stringify(e) === JSON.stringify(arr[i])) {
                return true;
            }
        }
    }
    else {
        for (let i = 0; i < length; i++) {
            if (e === arr[i]) {
                return true;
            }
        }
    }
    return false;
}
console.log(removeAllDuplicates([{ a: 1, b: 2 }, { a: 1, b: 3 }, { a: 1, b: 2 }, { a: 5, b: 4 }, { a: 1, b: 3 }]));
function removeAllDuplicates(arr) {
    const set = new Set(arr);
    const retArr = [];
    set.forEach(s => {
        retArr.push(s);
    });
    return retArr;
}
function isEqual(a, b) {
    if (typeof a == "object" || typeof b == "object") {
        return JSON.stringify(a) == JSON.stringify(b);
    }
    else {
        return a === b;
    }
}
function removeFromArr(e, arr) {
    const length = arr.length;
    const retArr = [];
    for (let i = 0; i < length; i++) {
        if (!isEqual(e, arr[i])) {
            retArr.push(arr[i]);
        }
    }
    return retArr;
}
//sha-256 fucntion
function sha256(data) {
    //@ts-ignore
    const hash = crypto_1.default.createHash("sha256");
    hash.update(data);
    return hash.digest("hex");
}
