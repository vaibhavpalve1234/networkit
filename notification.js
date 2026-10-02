const express = require("express");

const app = express();

const PORT = 3000;
const HOST = "0.0.0.0";

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    console.log("\n----------------------------------------");
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
    console.log("Client IP:", req.ip);
    console.log("Remote IP:", req.socket.remoteAddress);
    console.log("User-Agent:", req.headers["user-agent"]);
    console.log("Headers:", req.headers);

    if (Object.keys(req.body || {}).length > 0) {
        console.log("Body:", req.body);
    }

    console.log("----------------------------------------");

    next();
});

// --------------------------------------------------
// GET - Health Check
// --------------------------------------------------
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Laptop server is running",
        server: "Node.js + Express",
        host: HOST,
        port: PORT,
        timestamp: new Date().toISOString()
    });
});

// --------------------------------------------------
// GET - Server Information
// --------------------------------------------------
app.get("/info", (req, res) => {
    res.json({
        success: true,
        server: {
            host: HOST,
            port: PORT,
            protocol: "HTTP"
        },
        client: {
            ip: req.ip,
            remoteAddress: req.socket.remoteAddress,
            remotePort: req.socket.remotePort
        },
        request: {
            method: req.method,
            url: req.originalUrl,
            userAgent: req.headers["user-agent"]
        },
        timestamp: new Date().toISOString()
    });
});

// --------------------------------------------------
// GET - Test Notification
// --------------------------------------------------
app.get("/notification", (req, res) => {
    res.json({
        success: true,
        message: "GET notification endpoint is working",
        query: req.query,
        timestamp: new Date().toISOString()
    });
});

// --------------------------------------------------
// POST - Receive Notification
// --------------------------------------------------
app.post("/notification", (req, res) => {
    console.log("📱 Notification received");

    console.log("Notification body:");
    console.log(req.body);

    res.json({
        success: true,
        message: "Notification received successfully",
        data: req.body,
        receivedFrom: req.ip,
        timestamp: new Date().toISOString()
    });
});

// --------------------------------------------------
// PUT - Update Notification
// --------------------------------------------------
app.put("/notification/:id", (req, res) => {
    const { id } = req.params;

    res.json({
        success: true,
        message: "Notification updated",
        notificationId: id,
        data: req.body,
        timestamp: new Date().toISOString()
    });
});

// --------------------------------------------------
// PATCH - Partially Update Notification
// --------------------------------------------------
app.patch("/notification/:id", (req, res) => {
    const { id } = req.params;

    res.json({
        success: true,
        message: "Notification partially updated",
        notificationId: id,
        data: req.body,
        timestamp: new Date().toISOString()
    });
});

// --------------------------------------------------
// DELETE - Delete Notification
// --------------------------------------------------
app.delete("/notification/:id", (req, res) => {
    const { id } = req.params;

    res.json({
        success: true,
        message: "Notification deleted",
        notificationId: id,
        timestamp: new Date().toISOString()
    });
});

// --------------------------------------------------
// GET - Echo / Debug
// --------------------------------------------------
app.get("/debug", (req, res) => {
    res.json({
        success: true,

        request: {
            method: req.method,
            url: req.originalUrl,
            path: req.path,
            query: req.query,
            headers: req.headers
        },

        network: {
            clientIp: req.ip,
            remoteAddress: req.socket.remoteAddress,
            remotePort: req.socket.remotePort,
            localAddress: req.socket.localAddress,
            localPort: req.socket.localPort
        },

        timestamp: new Date().toISOString()
    });
});

// --------------------------------------------------
// 404 Handler
// --------------------------------------------------
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found",
        method: req.method,
        url: req.originalUrl
    });
});

// --------------------------------------------------
// Error Handler
// --------------------------------------------------
app.use((err, req, res, next) => {
    console.error("❌ Server error:", err);

    res.status(500).json({
        success: false,
        message: "Internal server error",
        error: err.message
    });
});

// --------------------------------------------------
// Start Server
// --------------------------------------------------
app.listen(PORT, HOST, () => {
    console.log("");
    console.log("========================================");
    console.log("🚀 Node.js server started");
    console.log("========================================");
    console.log(`Local:   http://localhost:${PORT}`);
    console.log(`Network: http://192.168.1.3:${PORT}`);
    console.log(`Host:    ${HOST}`);
    console.log(`Port:    ${PORT}`);
    console.log("========================================");
});