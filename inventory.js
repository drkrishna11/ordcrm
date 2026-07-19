const RAW_SHEET_NAME = "Inventory";
const ORDERING_SHEET_NAME = "Product";
const INVENTORY_HEADERS = ["Timestamp", "Product Name", "Stock", "Price", "Description"];

function doGet(e) {
  const action = (e.parameter && e.parameter.action) ? String(e.parameter.action) : "getProducts";

  if (action === "getProducts") {
    return getProducts();
  }

  return jsonResponse({ success: false, error: "Unknown GET action" }, 400);
}

function doPost(e) {
  let payload = {};

  if (e.postData && e.postData.type === "application/json") {
    payload = JSON.parse(e.postData.contents || "{}");
  } else {
    payload = Object.assign({}, e.parameter || {});
  }

  if (payload.action === "saveInventory" || payload.productName) {
    return saveInventory(payload);
  }

  if (payload.customerName && payload.phone && payload.items) {
    return saveOrder(payload);
  }

  return jsonResponse({ success: false, error: "Unknown POST payload" }, 400);
}

function getProducts() {
  const sheet = getSheet(ORDERING_SHEET_NAME);
  ensureSheetHeaders(sheet, INVENTORY_HEADERS);
  const data = sheet.getDataRange().getValues();
  const rawHeaders = data.shift() || [];
  const headers = rawHeaders.map((header) => {
    const key = String(header || "").trim().toLowerCase();
    if (key === "id" || key === "product id" || key === "productid" || key === "product") return "id";
    if (key === "name" || key === "product name" || key === "productname") return "name";
    return key;
  });

  const products = data
    .filter((row) => row.some((cell) => String(cell || "").trim() !== ""))
    .map((row) => {
      const item = {};
      headers.forEach((header, i) => {
        item[header] = row[i];
      });
      const name = String(item.name || item.productName || item["product name"] || item["product"] || "").trim();
      const id = String(item.id || item.productId || item["product id"] || item.sku || item.barcode || name).trim();
      return { id, name };
    })
    .filter((product) => product.id && product.name)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return jsonResponse(products);
}

function saveInventory(payload) {
  const rawSheet = getSheet(RAW_SHEET_NAME);
  const orderingSheet = getSheet(ORDERING_SHEET_NAME);

  ensureSheetHeaders(rawSheet, INVENTORY_HEADERS);
  ensureSheetHeaders(orderingSheet, INVENTORY_HEADERS);

  const row = [new Date(), payload.productName || "", payload.stock || "", payload.price || "", payload.description || ""];

  const written = [];

  try {
    rawSheet.appendRow(row);
    written.push(RAW_SHEET_NAME);
  } catch (err) {
    console.error('Failed to write to raw sheet', RAW_SHEET_NAME, err);
  }

  try {
    orderingSheet.appendRow(row);
    written.push(ORDERING_SHEET_NAME);
  } catch (err) {
    console.error('Failed to write to ordering sheet', ORDERING_SHEET_NAME, err);
  }

  try {
    sortSheetByColumn(rawSheet, "product name");
  } catch (e) {
    console.warn('Could not sort raw sheet', e);
  }

  try {
    sortSheetByColumn(orderingSheet, "product name");
  } catch (e) {
    console.warn('Could not sort ordering sheet', e);
  }

  SpreadsheetApp.flush();

  return jsonResponse({ success: true, wroteTo: written });
}

function saveOrder(payload) {
  const inventorySheet = getSheet(ORDERING_SHEET_NAME);
  ensureSheetHeaders(inventorySheet, INVENTORY_HEADERS);
  const inventoryData = inventorySheet.getDataRange().getValues();
  const inventoryHeaders = inventoryData.shift() || [];
  const normalizedHeaders = inventoryHeaders.map((header) => normalizeText(String(header || "")));
  const nameIndex = findHeaderIndex(normalizedHeaders, ["product name", "name"]);
  const stockIndex = findHeaderIndex(normalizedHeaders, ["stock", "stock qty"]);
  const idIndex = findHeaderIndex(normalizedHeaders, ["id", "product id", "productid"]);

  if (nameIndex < 0 || stockIndex < 0) {
    return jsonResponse({ success: false, error: "Product sheet missing Product Name or Stock columns." }, 500);
  }

  const inventoryMapById = {};
  const inventoryMapByName = {};

  inventoryData.forEach((row, rowIndex) => {
    const rowName = String(row[nameIndex] || "").trim();
    const record = {
      rowIndex: rowIndex + 2,
      stock: Number(row[stockIndex] || 0),
      name: rowName,
      id: idIndex >= 0 ? String(row[idIndex] || "").trim() : ""
    };
    if (record.id) {
      inventoryMapById[normalizeText(record.id)] = record;
    }
    if (record.name) {
      inventoryMapByName[normalizeText(record.name)] = record;
    }
  });

  const resolveInventoryRecord = (productKey) => {
    if (!productKey) return null;
    const exactKey = normalizeText(String(productKey));
    if (inventoryMapByName[exactKey]) return inventoryMapByName[exactKey];
    if (inventoryMapById[exactKey]) return inventoryMapById[exactKey];
    return null;
  };

  for (const item of payload.items || []) {
    const productId = String(item.productId || "").trim();
    const orderQty = Number(item.qty || 0);

    if (!productId || orderQty <= 0) {
      return jsonResponse({ success: false, error: `Invalid order quantity for ${productId || "unknown product"}.` }, 400);
    }

    const inventoryRecord = resolveInventoryRecord(productId);
    if (!inventoryRecord) {
      return jsonResponse({ success: false, error: `Product not found in List sheet: ${productId}.` }, 400);
    }

    if (orderQty > inventoryRecord.stock) {
      return jsonResponse({ success: false, error: `Insufficient stock for ${productId}. Available: ${inventoryRecord.stock}.` }, 400);
    }
  }

  const orderSheet = getSheet("Orders");
  const orderNumber = generateOrderNumber();

  (payload.items || []).forEach((item) => {
    const productId = String(item.productId || "").trim();
    const orderQty = Number(item.qty || 0);
    const inventoryRecord = resolveInventoryRecord(productId);

    orderSheet.appendRow([
      new Date(),
      orderNumber,
      payload.customerName || "",
      payload.phone || "",
      productId,
      item.qty || ""
    ]);

    const newStock = inventoryRecord.stock - orderQty;
    inventorySheet.getRange(inventoryRecord.rowIndex, stockIndex + 1).setValue(newStock);
    SpreadsheetApp.flush();
    inventoryRecord.stock = newStock;
  });

  return jsonResponse({ success: true, orderNumber });
}

function ensureSheetHeaders(sheet, headers) {
  const values = sheet.getDataRange().getValues();
  const hasContent = values.some((row) => row.some((cell) => String(cell || "").trim() !== ""));
  if (hasContent) return;
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findHeaderIndex(headers, candidates) {
  return headers.findIndex((header) => candidates.includes(header));
}

function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function sortSheetByColumn(sheet, headerName) {
  const range = sheet.getDataRange();
  const values = range.getValues();
  if (values.length <= 1) return;

  const headers = values[0].map((header) => String(header || "").trim().toLowerCase());
  const sortIndex = headers.indexOf(headerName.toLowerCase());
  if (sortIndex < 0) return;

  const body = values.slice(1);
  body.sort((a, b) => {
    const left = String(a[sortIndex] || "").trim().toLowerCase();
    const right = String(b[sortIndex] || "").trim().toLowerCase();
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });

  sheet.getRange(2, 1, body.length, body[0].length).setValues(body);
}

function jsonResponse(value, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);

  if (statusCode && output.setResponseCode) {
    output.setResponseCode(statusCode);
  }

  return output;
}

function generateOrderNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `ORD${stamp}${Math.floor(1000 + Math.random() * 9000)}`;
}
