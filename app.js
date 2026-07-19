const API_URL = "https://script.google.com/macros/s/AKfycbzW3D9O-6Sirh0QZV8r-qONSkRs23o_fA7HLLMHr8o6kQWWtv1jy1IlJyl6paFGoTU8/exec";

const state = {
  products: [],
  items: [{ productId: "", qty: "" }],
  orderNumber: "",
  isSubmitting: false,
  validationTriggered: false
};

const customerNameInput = document.getElementById("customerName");
const phoneInput = document.getElementById("phone");
const customerSection = document.getElementById("customerSection");
const placeOrderBtn = document.getElementById("placeOrderBtn");
const productsSection = document.getElementById("productsSection");
const productsList = document.getElementById("productsList");
const addProductBtn = document.getElementById("addProductBtn");
const submitOrderBtn = document.getElementById("submitOrderBtn");
const loadingOverlay = document.getElementById("loadingOverlay");
const successModal = document.getElementById("successModal");
const orderNumberEl = document.getElementById("orderNumber");
const newOrderBtn = document.getElementById("newOrderBtn");
const toastContainer = document.getElementById("toastContainer");

function sanitizeCustomerName() {
  customerNameInput.value = customerNameInput.value.replace(/[^A-Za-z\s]/g, "");
}

function sanitizePhoneInput() {
  const digits = phoneInput.value.replace(/\D/g, "").slice(0, 10);
  phoneInput.value = digits && !/^[6789]/.test(digits) ? "" : digits;
}

function init() {
  registerServiceWorker();
  loadProducts();
  attachEvents();
  renderProducts();
}

function attachEvents() {
  placeOrderBtn.addEventListener("click", handlePlaceOrder);
  addProductBtn.addEventListener("click", addProductItem);
  submitOrderBtn.addEventListener("click", handleSubmitOrder);
  newOrderBtn.addEventListener("click", resetFlow);
  customerNameInput.addEventListener("input", sanitizeCustomerName);
  phoneInput.addEventListener("input", sanitizePhoneInput);

  productsList.addEventListener("change", (event) => {
    const select = event.target;
    if (select.matches("[data-role='product-select']")) {
      const index = Number(select.dataset.index);
      state.items[index].productId = select.value;
      
      // Reset quantity when product is cleared (Select a product)
      if (!select.value) {
        state.items[index].qty = "";
      }
      
      renderProducts();
      updateAddProductButtonState();
    }
  });

  productsList.addEventListener("input", (event) => {
    const input = event.target;
    if (input.matches("[data-role='quantity-input']")) {
      const index = Number(input.dataset.index);
      state.items[index].qty = input.value;

      if (state.validationTriggered) {
        const label = input.closest("label.field");
        if (label) {
          const isValidQty = input.value.trim() && Number(input.value) > 0;
          label.classList.toggle("field--error", !isValidQty);
        }
      }

      updateAddProductButtonState();
    }
  });

  productsList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='remove-product']")
    if (!button) return;
    const index = Number(button.dataset.index);
    state.items.splice(index, 1);
    if (state.items.length === 0) {
      state.items.push({ productId: "", qty: "" });
    }
    renderProducts();
  });
}

function normalizeProducts(products = []) {
  return products
    .map((product) => ({
      id: String(product.id || product.Id || product.productId || product["Product ID"] || product["product id"] || "").trim(),
      name: String(product.name || product.Name || product.productName || product["Product Name"] || "").trim()
    }))
    .filter((product) => product.id && product.name);
}

async function loadProducts() {
  try {
    const response = await fetch(`${API_URL}?action=getProducts&cacheBust=${Date.now()}`, {
      method: "GET",
      cache: "no-store"
    });
    if (!response.ok) throw new Error("API unavailable");
    const data = await response.json();
    state.products = normalizeProducts(Array.isArray(data) ? data : []);
  } catch (error) {
    state.products = [
      { id: "P001", name: "Soap" },
      { id: "P002", name: "Shampoo" },
      { id: "P003", name: "Milk" },
      { id: "P004", name: "Bread" }
    ];
  }

  if (state.products.length === 0) {
    state.products = [
      { id: "P001", name: "Soap" },
      { id: "P002", name: "Shampoo" }
    ];
  }

  renderProducts();
}

function handlePlaceOrder() {
  const customerName = customerNameInput.value.trim();
  const phone = phoneInput.value.trim();

  if (!customerName) {
    showToast("Please enter the customer name.", "error");
    customerNameInput.focus();
    return;
  }

  if (!/^[A-Za-z\s]+$/.test(customerName)) {
    showToast("Customer name must contain letters only.", "error");
    customerNameInput.focus();
    return;
  }

  if (!/^[6789]\d{9}$/.test(phone)) {
    showToast("Mobile number must be 10 digits and start with 6, 7, 8, or 9.", "error");
    phoneInput.focus();
    state.isSubmitting = false;
    return;
  }

  customerSection.classList.add("hidden");
  productsSection.classList.remove("hidden");
  productsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  showToast("Great! Now add your products.", "success");
}

function addProductItem() {
  const last = state.items[state.items.length - 1];
  const lastIncomplete = !last.productId || !last.qty || Number(last.qty) <= 0;
  if (lastIncomplete) {
    state.validationTriggered = true;
    renderProducts();
    const idx = state.items.length - 1;
    const sel = productsList.querySelector(`select[data-role='product-select'][data-index='${idx}']`);
    const qty = productsList.querySelector(`input[data-role='quantity-input'][data-index='${idx}']`);
    if (!last.productId) {
      sel && sel.focus();
      sel && sel.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      qty && qty.focus();
      qty && qty.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return;
  }

  state.items.push({ productId: "", qty: "" });
  renderProducts();
  requestAnimationFrame(() => {
    const newIndex = state.items.length - 1;
    const lastSelect = productsList.querySelector(`select[data-role='product-select'][data-index='${newIndex}']`);
    if (lastSelect) {
      lastSelect.focus();
      lastSelect.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
  showToast("New product slot added.", "success");
}

function renderProducts() {
  if (state.products.length === 0) {
    productsList.innerHTML = '<p class="empty-state">No products available yet.</p>';
    return;
  }

  productsList.innerHTML = "";

  const fragment = document.createDocumentFragment();

  state.items.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "product-card";

    const productInvalid = state.validationTriggered && !item.productId;
    const qtyInvalid = state.validationTriggered && (!item.productId || !item.qty || Number(item.qty) <= 0);

    const usedProductIds = state.items
      .map((entry, entryIndex) => (entryIndex !== index && entry.productId ? entry.productId : null))
      .filter(Boolean);

    const selectOptions = state.products.map((product) => {
      const isSelectedByAnother = usedProductIds.includes(product.id) && product.id !== item.productId;
      return `<option value="${product.id}" ${product.id === item.productId ? "selected" : ""} ${isSelectedByAnother ? "disabled" : ""}>${product.name}</option>`;
    }).join("");

    card.innerHTML = `
      <div class="product-meta">
        <strong>Product ${index + 1}</strong>
        <button class="remove-btn" type="button" data-action="remove-product" data-index="${index}">Remove</button>
      </div>
      <div class="product-row">
        <label class="field${productInvalid ? " field--error" : ""}">
          <span>Product</span>
          <select data-role="product-select" data-index="${index}">
            <option value="">Select a product</option>
            ${selectOptions}
          </select>
        </label>
        <label class="field${qtyInvalid ? " field--error" : ""}">
          <span>Qty</span>
          <input data-role="quantity-input" data-index="${index}" type="number" min="1" value="${item.qty || ""}" placeholder="Qty" />
        </label>
      </div>
    `;

    fragment.appendChild(card);
  });

  productsList.appendChild(fragment);
  updateAddProductButtonState();
}

function updateAddProductButtonState() {
  if (!state.items || state.items.length === 0) {
    addProductBtn.disabled = true;
    return;
  }

  // Check that ALL items are complete before allowing Add Product
  const allItemsComplete = state.items.every(item => {
    // Check if product is selected
    const hasProduct = item.productId && String(item.productId).trim() !== "";
    
    // Check if quantity is valid (not empty, not zero, not negative)
    const qtyValue = String(item.qty).trim();
    const hasValidQty = qtyValue !== "" && Number(qtyValue) > 0;
    
    return hasProduct && hasValidQty;
  });
  
  // Button is enabled only if ALL items are complete
  addProductBtn.disabled = !allItemsComplete;
}

async function handleSubmitOrder() {
  if (state.isSubmitting || submitOrderBtn.disabled) return;
  state.isSubmitting = true;
  state.validationTriggered = true;
  renderProducts();

  const customerName = customerNameInput.value.trim();
  const phone = phoneInput.value.trim();

  if (!customerName) {
    customerNameInput.focus();
    state.isSubmitting = false;
    return;
  }

  if (!/^[A-Za-z\s]+$/.test(customerName)) {
    customerNameInput.focus();
    state.isSubmitting = false;
    return;
  }

  if (!/^[6789]\d{9}$/.test(phone)) {
    phoneInput.focus();
    state.isSubmitting = false;
    return;
  }

  const hasAnyProduct = state.items.some((item) => item.productId);
  if (!hasAnyProduct) {
    state.isSubmitting = false;
    return;
  }

  const incompleteItems = state.items.filter((item) => !item.productId || !item.qty || Number(item.qty) <= 0);
  if (incompleteItems.length > 0) {
    const firstIncomplete = incompleteItems[0];
    const index = state.items.indexOf(firstIncomplete);
    const firstMissing = !firstIncomplete.productId
      ? productsList.querySelector(`select[data-role='product-select'][data-index='${index}']`)
      : productsList.querySelector(`input[data-role='quantity-input'][data-index='${index}']`);

    if (firstMissing) {
      firstMissing.focus();
      firstMissing.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    state.isSubmitting = false;
    return;
  }

  const validItems = state.items.filter((item) => item.productId && Number(item.qty) > 0);

  placeOrderBtn.disabled = true;
  submitOrderBtn.disabled = true;
  addProductBtn.disabled = true;
  loadingOverlay.classList.remove("hidden");
  loadingOverlay.setAttribute("aria-hidden", "false");

  try {
    const payload = {
      customerName,
      phone,
      items: validItems.map((item) => {
        const selectedProduct = state.products.find((product) => product.id === item.productId);
        return {
          productId: selectedProduct ? selectedProduct.name : item.productId,
          qty: Number(item.qty)
        };
      })
    };

    await new Promise((resolve) => setTimeout(resolve, 1400));

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const contentType = response.headers.get("content-type") || "";
    let result = {};

    if (contentType.includes("application/json")) {
      result = await response.json().catch(() => ({}));
    } else {
      const bodyText = await response.text().catch(() => "");
      if (bodyText.includes("Script function not found")) {
        throw new Error("Backend script missing doPost.");
      }
      if (bodyText.trim().startsWith("<")) {
        console.error("Order API returned HTML instead of JSON:", bodyText.slice(0, 500));
        throw new Error("Invalid backend response.");
      }
    }

    if (!response.ok) {
      throw new Error(result.error || "Request failed");
    }

    state.orderNumber = result.orderNumber || generateOrderNumber();
    orderNumberEl.textContent = state.orderNumber;
    successModal.classList.remove("hidden");
    successModal.setAttribute("aria-hidden", "false");
  } catch (error) {
    console.error("Order submit failed:", error);
    showToast(error.message || "Could not submit order. Try again later.", "error");
  } finally {
    loadingOverlay.classList.add("hidden");
    loadingOverlay.setAttribute("aria-hidden", "true");
    placeOrderBtn.disabled = false;
    submitOrderBtn.disabled = false;
    addProductBtn.disabled = false;
    state.isSubmitting = false;
  }
}

function resetFlow() {
  customerNameInput.value = "";
  phoneInput.value = "";
  state.items = [{ productId: "", qty: "" }];
  state.validationTriggered = false;
  renderProducts();
  customerSection.classList.remove("hidden");
  productsSection.classList.add("hidden");
  successModal.classList.add("hidden");
  successModal.setAttribute("aria-hidden", "true");
  showToast("Ready for a new order.", "success");
  addProductBtn.disabled = true;
}

function generateOrderNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `ORD${stamp}${Math.floor(1000 + Math.random() * 9000)}`;
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2200);
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    });
  }
}

init();
