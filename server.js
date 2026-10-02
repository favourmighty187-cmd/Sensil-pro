const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me";

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json());

/* ---------- SETTINGS (edit these) ---------- */
const DEFAULT_SETTINGS = {
  "General": 180, "Red Dot": 170, "2x Scope": 165,
  "4x Scope": 155, "Sniper": 90, "Free Look": 120
};
const DEVICE_SETTINGS = {};

/* ---------- STORAGE ---------- */
function loadOrders() {
  try { return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8")); }
  catch (e) { return {}; }
}
function saveOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

/* ---------- UPLOADS ---------- */
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) =>
      cb(null, crypto.randomUUID() + path.extname(file.originalname).slice(0, 10))
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^(image|video)\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image or video files are allowed."));
  }
});

/* ---------- ADMIN AUTH (Bearer password) ---------- */
function adminAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const pass = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(pass), b = Buffer.from(ADMIN_PASSWORD);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  res.status(401).json({ error: "Unauthorized" });
}

/* ---------- PAGES (works from /public or main folder) ---------- */
function findPage(name) {
  const inPublic = path.join(__dirname, "public", name);
  return fs.existsSync(inPublic) ? inPublic : path.join(__dirname, name);
}
app.get("/", (req, res) => res.sendFile(findPage("index.html")));
app.get("/index.html", (req, res) => res.sendFile(findPage("index.html")));
app.get("/device.html", (req, res) => res.sendFile(findPage("device.html")));
app.get("/upload.html", (req, res) => res.sendFile(findPage("upload.html")));
app.get("/admin", (req, res) => res.sendFile(findPage("admin.html")));
app.get("/admin.html", (req, res) => res.sendFile(findPage("admin.html")));
app.use("/uploads", express.static(UPLOAD_DIR));

/* ---------- CUSTOMER API ---------- */
app.post("/api/orders", upload.single("proof"), (req, res) => {
  const name = (req.body.name || "").trim().slice(0, 60);
  const device = (req.body.device || "").trim().slice(0, 60);
  if (!name || !device || !req.file) {
    return res.status(400).json({ error: "Name, device and payment proof are required." });
  }
  const orders = loadOrders();
  const id = crypto.randomUUID();
  orders[id] = {
    id, name, device,
    proofFile: req.file.filename,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  saveOrders(orders);
  res.json({ orderId: id });
});

app.get("/api/orders/:id", (req, res) => {
  const order = loadOrders()[req.params.id];
  if (!order) return res.status(404).json({ error: "Order not found" });
  const out = { status: order.status, device: order.device };
  if (order.status === "approved") {
    out.settings = DEVICE_SETTINGS[order.device] || DEFAULT_SETTINGS;
  }
  res.json(out);
});

/* ---------- ADMIN API ---------- */
app.get("/api/admin/orders", adminAuth, (req, res) => {
  const orders = Object.values(loadOrders())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(o => ({ ...o, proofUrl: "/uploads/" + o.proofFile }));
  res.json({ orders });
});

function changeStatus(id, status, res) {
  if (!["approved", "rejected", "pending"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const orders = loadOrders();
  const order = orders[id];
  if (!order) return res.status(404).json({ error: "Order not found" });
  order.status = status;
  saveOrders(orders);
  res.json({ ok: true, status });
}

app.post("/api/admin/orders/:id/approve", adminAuth, (req, res) =>
  changeStatus(req.params.id, "approved", res));
app.post("/api/admin/orders/:id/reject", adminAuth, (req, res) =>
  changeStatus(req.params.id, "rejected", res));

app.post("/api/admin/approve/:id", adminAuth, (req, res) =>
  changeStatus(req.params.id, "approved", res));
app.post("/api/admin/reject/:id", adminAuth, (req, res) =>
  changeStatus(req.params.id, "rejected", res));

function bodyStatus(req, res) {
  changeStatus(req.params.id, req.body && req.body.status, res);
}
app.post("/api/admin/orders/:id", adminAuth, bodyStatus);
app.patch("/api/admin/orders/:id", adminAuth, bodyStatus);

/* ---------- ERRORS ---------- */
app.use((err, req, res, next) => {
  const msg = err.code === "LIMIT_FILE_SIZE" ? "Maximum file size is 25MB." : err.message;
  res.status(400).json({ error: msg || "Something went wrong." });
});

app.listen(PORT, "0.0.0.0", () => console.log("Server running on port " + PORT));