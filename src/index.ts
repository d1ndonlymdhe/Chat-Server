import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import crypto from "crypto"
import User from "./utils/User";
import Message from "./utils/Message";
import mongoose from "mongoose";
//setup dotenv
import dotenv from "dotenv";
dotenv.config();
const mongoURI = "mongodb://127.0.0.1:27017/instagram";


const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    }
});

app.get("/", (req, res) => {
    res.send("ok")
})

type username = string;
type userSocket = {
    username: username;
    sockets: Socket[];
}
type roomType = {
    members: userSocket[];
    roomId: string;
}
const connectedUsers: Set<userSocket> = new Set();
const rooms: Set<roomType> = new Set();

io.on("connection", (socket: Socket) => {
    console.log("a user connected")
    socket.on("subscribe", (payload: { username: username }) => {
        const isAlreadySubscribed = findFromSet(user => user.username === payload.username, connectedUsers);
        if (isAlreadySubscribed) {
            isAlreadySubscribed.sockets.push(socket);
            console.log(`${payload.username} subscribed again`)
            console.log("hello")
            const connectedRooms = findMultipleFromSet<roomType>((room) => {
                try {
                    const members = room.members
                    return members.some(member => member.sockets.includes(socket))
                } catch (err) {
                    return false;
                }
            }, rooms)
            const connectedRoomIds = connectedRooms.map(room => room.roomId)
            console.log("join These rooms", connectedRoomIds)
            socket.emit("already subscribed", { joinThese: connectedRoomIds })
        } else {
            connectedUsers.add({ username: payload.username, sockets: [socket] })
            console.log(`${payload.username} subscribed`)
        }
        // console.log(connectedUsers);
    })
    socket.on("createRoom", (payload: { self: username, reciever: username }) => {
        let { self, reciever } = payload;
        const members = [self, reciever];
        console.log("members = ", members)
        if (members.length < 2) {
            socket.emit("roomCreateError", { status: "error", message: "not enough members" });
        } else {
            //get all member sockets
            const memberSockets = members.map(member => {
                const memberSocket = findFromSet<userSocket>((user) => { return user.username == member }, connectedUsers)!;
                return memberSocket;
            })
            //check all connected;
            const allConnected = members.filter(member => {
                return findFromSet<userSocket>((user) => { return user.username == member }, connectedUsers) !== undefined;
            }).length == members.length
            const roomWithMembersAlreadyExists = findFromSet<roomType>((room) => {
                return JSON.stringify(room.members.map(m => m.username)) === JSON.stringify(members)
            }, rooms)
            const roomId = sha256(members.join("") + (new Date().getTime()));
            if (allConnected) {
                if (!roomWithMembersAlreadyExists) {
                    const room = {
                        members: memberSockets,
                        roomId: roomId,
                    }
                    rooms.add(room)
                    console.log(rooms);
                    emitAll("roomCreated", { status: "success", roomId: roomId, members: members }, room)
                }
            } else {
                const room = {
                    members: [{ username: self, sockets: [socket] }],
                    roomId: roomId,
                }
                rooms.add(room)
                console.log(rooms);
                socket.emit("roomCreated", { status: "success", roomId: roomId, members: members })
                mongoose.connect(mongoURI).then(() => {
                    const newMessage = new Message();
                    newMessage.to = reciever;
                    newMessage.from = self;
                    newMessage.roomId = roomId;
                    newMessage.content = `room created while ${reciever} was offline`;
                    newMessage.save().then(() => {
                        User.findOne({ username: reciever }).then((user) => {
                            user.pendingMessages.push(newMessage._id);
                            user.save()
                        })
                    })
                })
                // socket.emit("room creation error", { message: `${reciever} not connected` })
            }
        }
    })
    socket.on("joinRooms", (payload: { roomIds: string[], username: string }) => {
        const roomsToBeConnected = findMultipleFromSet<roomType>((room) => { return payload.roomIds.includes(room.roomId) }, rooms)!;
        if (roomsToBeConnected) {
            roomsToBeConnected.forEach(room => {
                console.log(room)
                const members = room.members.map(member => member.username);
                if (!members.includes(payload.username)) {
                    console.log(`${payload.username} joined ${room.roomId}`)
                    room.members.push({ username: payload.username, sockets: [socket] })
                    console.log({ status: "success", roomId: room.roomId, members: members })
                    socket.emit("roomCreated", { status: "success", roomId: room.roomId, members: members })
                } else {
                    // const member = findFromSet<userSocket>((user) => { return user.username == payload.username }, room.members)!;
                    const member = room.members.find(member => member.username === payload.username)!;
                    const updatedSockets = findFromSet<userSocket>((user) => { return user.username == payload.username }, connectedUsers)!;
                    const tempMembers = []
                    for (let i = 0; i < room.members.length; i++) {
                        if (room.members[i].username !== payload.username) {
                            tempMembers.push(room.members[i])
                        }
                    }
                    tempMembers.push(updatedSockets)
                    room.members = tempMembers
                    const members = room.members.map(member => member.username);
                    socket.emit("roomCreated", { status: "success", roomId: room.roomId, members: members })
                }
            })
        }
    })
    socket.on("message", (payload: { to: username, from: username, message: string, roomId: string }) => {
        const { roomId, to, from, message } = payload;
        console.log("message payload = ", payload);
        const room = findFromSet<roomType>((room) => { return room.roomId == roomId }, rooms);

        if (room) {
            const recieverConnected = findFromSet<userSocket>((user) => { return user.username == to }, connectedUsers) !== undefined;
            if (recieverConnected) {
                emitAll("newMessage", payload, room);
            } else {
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
                const user = findFromSet<userSocket>((user) => { return user.username == from }, connectedUsers);
                user?.sockets.forEach(socket => {
                    socket.emit("newMessage", payload);
                })
            }
        } else {
            socket.emit("Message Error", { status: "error", message: "room not found" })
        }
    })
    socket.on("disconnect", () => {
        console.log("disconnected");
        const user = findFromSet<userSocket>((user) => { return user.sockets.includes(socket) }, connectedUsers);
        if (user) {
            if (user.sockets.length > 1) {
                user.sockets = user.sockets.filter(s => s !== socket);
            } else {
                const connectedRooms = findMultipleFromSet<roomType>((room) => {
                    try {
                        const members = room.members
                        return members.some(member => member.sockets.includes(socket))
                    } catch (err) {
                        return false;
                    }
                }, rooms)
                connectedRooms.forEach(connectedRoom => {
                    connectedRoom.members = connectedRoom.members.filter(member => {
                        return !member.sockets.some(s => s === socket);
                    })
                })
            }
            connectedUsers.delete(user)
        }
    })
})

httpServer.listen(4000)

function deepIncludes<T>(arr: T[], item: T): boolean {
    let length = arr.length;
    for (let i = 0; i < length; i++) {
        if (JSON.stringify(arr[i]) === JSON.stringify(item)) {
            return true;
        }
    }
    return false;
}

function findFromSet<T>(callback: (arg1: T) => boolean, set: Set<T>) {
    const iterable = set.values();
    for (const el of iterable) {
        if (callback(el)) {
            return el;
        }
    }
    return undefined
}
function findMultipleFromSet<T>(callback: (arg1: T) => boolean, set: Set<T>) {
    const iterable = set.values();
    const retArr: T[] = []
    for (const el of iterable) {
        if (callback(el)) {
            retArr.push(el)
        }
    }
    return retArr;
}
function emitAll(event: string, message: Object, room: roomType) {
    room.members.forEach(member => {
        console.log("emmitting for ", member.username);
        member.sockets.forEach(socket => {
            socket.emit(event, message)
        })
    })
}

//sha-256 fucntion
function sha256(data: string) {
    //@ts-ignore
    const hash = crypto.createHash("sha256");
    hash.update(data);
    return hash.digest("hex");
}