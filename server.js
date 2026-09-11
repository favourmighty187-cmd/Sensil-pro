const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "CHANGE_THIS_PASSWORD";

const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DATABASE = path.join(DATA_DIR, "orders.json");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!fs.existsSync(DATABASE)) {
  fs.writeFileSync(DATABASE, "[]");
}

const upload = multer({
  dest: UPLOAD_DIR,
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

app.use(express.json());

app.use(
  express.static(path.join(__dirname, "public"))
);

app.use(
  "/uploads",
  express.static(UPLOAD_DIR)
);

function getOrders() {
  return JSON.parse(
    fs.readFileSync(DATABASE, "utf8")
  );
}

function saveOrders(orders) {
  fs.writeFileSync(
    DATABASE,
    JSON.stringify(orders, null, 2)
  );
}

function createOrderId() {
  return (
    "SP-" +
    Date.now().toString(36).toUpperCase() +
    "-" +
    crypto.randomBytes(2).toString("hex").toUpperCase()
  );
}

function authenticate(req, res, next) {
  const authorization =
    req.headers.authorization;

  if (
    authorization !==
    "Bearer " + ADMIN_PASSWORD
  ) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  next();
}

app.post(
  "/api/orders",
  upload.single("proof"),
  (req, res) => {

    if (!req.file) {
      return res.status(400).json({
        error: "Payment proof is required"
      });
    }

    if (
      !req.body.name ||
      !req.body.device
    ) {
      return res.status(400).json({
        error: "Name and device are required"
      });
    }

    const orderId = createOrderId();

    const extension =
      path.extname(
        req.file.originalname
      ).toLowerCase();

    const filename =
      orderId + extension;

    fs.renameSync(
      req.file.path,
      path.join(
        UPLOAD_DIR,
        filename
      )
    );

    const orders = getOrders();

    orders.push({
      orderId,
      name:
        req.body.name.slice(0, 80),
      device:
        req.body.device.slice(0, 80),
      status: "pending",
      createdAt:
        new Date().toISOString(),
      proofUrl:
        "/uploads/" + filename
    });

    saveOrders(orders);

    res.json({
      orderId
    });
  }
);

app.get(
  "/api/orders/:id",
  (req, res) => {

    const order =
      getOrders().find(
        x =>
          x.orderId ===
          req.params.id
      );

    if (!order) {
      return res.status(404).json({
        error: "Order not found"
      });
    }

    res.json({
      orderId: order.orderId,
      status: order.status,
      device: order.device
    });
  }
);

app.get(
  "/api/admin/orders",
  authenticate,
  (req, res) => {

    const orders =
      getOrders().sort(
        (a, b) =>
          b.createdAt
            .localeCompare(b.createdAt)
      );

    res.json({
      orders
    });
  }
);

app.post(
  "/api/admin/orders/:id",
  authenticate,
  (req, res) => {

    const orders =
      getOrders();

    const order =
      orders.find(
        x =>
          x.orderId ===
          req.params.id
      );

    if (!order) {
      return res.status(404).json({
        error: "Order not found"
      });
    }

    if (
      req.body.action !== "approve" &&
      req.body.action !== "reject"
    ) {
      return res.status(400).json({
        error: "Invalid action"
      });
    }

    order.status =
      req.body.action === "approve"
        ? "approved"
        : "rejected";

    order.reviewedAt =
      new Date().toISOString();

    saveOrders(orders);

    res.json({
      success: true,
      status: order.status
    });
  }
);

app.listen(
  PORT,
  () => {
    console.log(
      "SENSI PRO running on port " +
      PORT
    );
  }
);