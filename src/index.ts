import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import crypto from "crypto"
import User from "./utils/User";
import Message from "./utils/Message";
import mongoose from "mongoose";
//setup dotenv
const mongoURI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/instagram";
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    }
})

app.get("/", (req, res) => {
    res.send("Ok");
})

type user = {
    username: string,
    socketId: string
}
type room = {
    id: string;
    members: string[]
}
let users: user[] = []
let rooms: room[] = []
let connectedSockets: Socket[] = []
io.on("connection", (socket: Socket) => {
    console.log("New Conection")
    socket.on("subscribe", (payload: { username: string }) => {
        const { username } = payload
        const user = { username, socketId: socket.id };
        users.push(user);
        connectedSockets.push(socket)
        const userAlreadyExists = checkDuplicateInArr(user, users);
        if (userAlreadyExists) {
            console.log(username + " subscribed again");
            //find connected rooms
            const roomIdsToBeConnected: string[] = [];
            const numberOfRooms = rooms.length
            for (let i = 0; i < numberOfRooms; i++) {
                if (existsInArr(user.username, rooms[i].members)) {
                    roomIdsToBeConnected.push(rooms[i].id);
                }
            }
            console.log("Join These Rooms ", roomIdsToBeConnected)
            socket.emit("already subscribed", { joinThese: roomIdsToBeConnected })
        } else {
            console.log(username + " subscribed")
            console.log("users = ", users);
        }
    })
    socket.on("createRoom", (payload: { self: string, reciever: string }) => {
        let { self, reciever } = payload;
        const members = [self, reciever];
        if (!self || !reciever) {
            socket.emit("roomCreateError", { status: "error", message: "not enougn members" })
        } else {
            const socketsToAdd: Socket[] = [];
            const numberOfUsers = users.length;
            for (let i = 0; i < numberOfUsers; i++) {
                if (users[i].username === self || users[i].username === reciever) {
                    const numberOfSockets = connectedSockets.length;
                    const userSocketId = users[i].socketId
                    for (let j = 0; j < numberOfSockets; j++) {
                        if (connectedSockets[j].id === userSocketId) {
                            socketsToAdd.push(connectedSockets[j])
                        }
                    }
                }
            }
            //if the reciever is connected
            if (existsInArr(reciever, users.map(user => user.username))) {
                console.log("normal room creation")
                const room: room = {
                    members: [self, reciever],
                    id: sha256(members.join("") + (new Date().getTime()))
                }
                rooms.push(room)
                console.log("Created Room = ", room);
                socket.join(room.id);
                socketsToAdd.forEach(socket => {
                    socket.join(room.id)
                })
                socket.to(room.id).emit("roomCreated", { status: "success", roomId: room.id, members: [self, reciever] })
                socket.emit("roomCreated", { status: "success", roomId: room.id, members: [self, reciever] })
            } else {
                console.log("special room creation")
                const room: room = {
                    members: [self, reciever],
                    id: sha256(self + reciever + (new Date().getTime()))
                }
                rooms.push(room);
                socket.join(room.id);
                socket.emit("roomCreated", { status: "success", roomId: room.id, members: [self, reciever] })
                console.log("room created while reciever was offline");
                console.log("Created Room = ", room);
                mongoose.connect(mongoURI).then(() => {
                    const newMessage = new Message();
                    newMessage.to = reciever;
                    newMessage.from = self;
                    newMessage.roomId = room.id;
                    newMessage.content = `room created while ${reciever} was offline`;
                    newMessage.save().then(() => {
                        User.findOne({ username: reciever }).then((user) => {
                            user.pendingMessages.push(newMessage._id);
                            user.save()
                        })
                    })
                })
            }
        }
    })
    socket.on("joinRooms", (payload: { roomIds: string[], username: string }) => {
        const { roomIds, username } = payload;
        const roomsToBeConnected: room[] = [];
        const numberOfRooms = rooms.length;
        for (let i = 0; i < numberOfRooms; i++) {
            //rooms itself is mutated
            const room = rooms[i]
            if (existsInArr(room.id, roomIds)) {
                room.members.push(username);
                socket.join(room.id)
                //client expects just two members so need to remove duplicates and send
                socket.emit("roomCreated", { status: "success", roomId: room.id, members: removeAllDuplicates(room.members) })
                roomsToBeConnected.push(room);
            }
        }
    })
    socket.on("message", (payload: { to: string, from: string, message: string, roomId: string }) => {
        const { roomId, to, from, message } = payload;

        const roomExists = existsInArr(roomId, rooms.map(room => room.id));
        if (roomExists) {
            const recieverConnected = existsInArr(to, users.map(user => user.username));
            if (recieverConnected) {
                console.log("Normal Message");
                socket.emit("newMessage", payload);
                socket.to(roomId).emit("newMessage", payload)
            } else {
                console.log("Write message to Database")
                mongoose.connect(mongoURI).then(() => {
                    const newMessage = new Message();
                    newMessage.to = to;
                    newMessage.from = from;
                    newMessage.roomId = roomId;
                    newMessage.content = message;
                    newMessage.save().then(() => {
                        User.findOne({ username: to }).then((user) => {
                            user.pendingMessages.push(newMessage._id);
                            user.save()
                        })
                    })
                })
                socket.to(roomId).emit("newMessage", payload)
                socket.emit("newMessage", payload);
            }
        }
    })
    socket.on("disconnect", () => {
        let user: user | undefined = undefined
        const numberOfUsers = users.length;
        for (let i = 0; i < numberOfUsers; i++) {
            if (users[i].socketId == socket.id) {
                user = users[i];
                break;
            }
        }
        const numberOfConnectedSockets = connectedSockets.length
        const tempSockets: Socket[] = []
        for (let i = 0; i < numberOfConnectedSockets; i++) {
            if (connectedSockets[i].id != socket.id) {
                tempSockets.push(connectedSockets[i])
            } else {
                continue;
            }
        }
        connectedSockets = tempSockets
        if (user) {
            const numberOfRooms = rooms.length;
            const tempUsers: user[] = [];
            for (let i = 0; i < users.length; i++) {
                const innerUser = users[i];
                if (user.username != innerUser.username && user.socketId != innerUser.socketId) {
                    tempUsers.push(innerUser)
                }
                users = tempUsers;
            }
            users = removeFromArr(user, users);
            for (let i = 0; i < numberOfRooms; i++) {
                if (existsInArr(user.username, rooms[i].members)) {
                    rooms[i].members = removeFromArr(user.username, rooms[i].members);
                }
            }
            console.log(`${user.username} disconnected`)
            console.log("updated users array = ", users)
        }
    })
})


httpServer.listen(process.env.PORT || 4000)

function checkDuplicateInArr<T>(e: T, arr: T[]) {
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
    } else {
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
function existsInArr<T>(e: T, arr: T[]) {
    const length = arr.length;
    if (typeof e == "object") {
        for (let i = 0; i < length; i++) {
            if (JSON.stringify(e) === JSON.stringify(arr[i])) {
                return true;
            }
        }
    } else {
        for (let i = 0; i < length; i++) {
            if (e === arr[i]) {
                return true;
            }
        }
    }
    return false;
}


function removeAllDuplicates<T>(arr: T[]) {
    const set = new Set(arr)
    const retArr: T[] = [];
    set.forEach(s => {
        retArr.push(s);
    })
    return retArr;
}
function isEqual(a: any, b: any) {
    if (typeof a == "object" || typeof b == "object") {
        return JSON.stringify(a) == JSON.stringify(b)
    } else {
        return a === b;
    }
}
function removeFromArr<T>(e: T, arr: T[]) {
    const length = arr.length;
    const retArr: T[] = []
    for (let i = 0; i < length; i++) {
        if (!isEqual(e, arr[i])) {
            retArr.push(arr[i]);
        }
    }
    return retArr;
}
//sha-256 fucntion
function sha256(data: string) {
    //@ts-ignore
    const hash = crypto.createHash("sha256");
    hash.update(data);
    return hash.digest("hex");
}