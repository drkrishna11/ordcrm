const API_URL = "https://script.google.com/macros/s/AKfycbzW3D9O-6Sirh0QZV8r-qONSkRs23o_fA7HLLMHr8o6kQWWtv1jy1IlJyl6paFGoTU8/exec";

const inventoryForm = document.getElementById("inventoryForm");
const productNameInput = document.getElementById("productName");
const stockInput = document.getElementById("stock");
const priceInput = document.getElementById("price");
const descriptionInput = document.getElementById("description");
const productImageInput = document.getElementById("productImage");
const imagePreview = document.getElementById("imagePreview");
const loadingOverlay = document.getElementById("loadingOverlay");
const toastContainer = document.getElementById("toastContainer");

function initInventory() {
  inventoryForm.addEventListener("submit", handleInventorySubmit);
  productImageInput.addEventListener("change", updateImagePreview);
}

function updateImagePreview() {
  imagePreview.innerHTML = "";
  const file = productImageInput.files[0];
  if (!file) {
    imagePreview.classList.add("hidden");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const img = document.createElement("img");
    img.src = reader.result;
    img.alt = "Product preview";
    img.className = "preview-image";
    imagePreview.appendChild(img);
    imagePreview.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}

async function handleInventorySubmit(event) {
  event.preventDefault();

  const productName = productNameInput.value.trim();
  const stock = stockInput.value.trim();
  const price = priceInput.value.trim();
  const description = descriptionInput.value.trim();

  if (!productName) {
    showToast("Product name is required.", "error");
    productNameInput.focus();
    return;
  }

  if (stock === "" || Number(stock) < 0 || !Number.isInteger(Number(stock))) {
    showToast("Stock must be a non-negative whole number.", "error");
    stockInput.focus();
    return;
  }

  if (price === "" || Number(price) < 0) {
    showToast("Price must be a non-negative value.", "error");
    priceInput.focus();
    return;
  }

  const formData = new FormData();
  formData.append("action", "saveInventory");
  formData.append("productName", productName);
  formData.append("stock", stock);
  formData.append("price", price);
  formData.append("description", description);

  const imageFile = productImageInput.files[0];
  if (imageFile) {
    formData.append("productImage", imageFile);
  }

  loadingOverlay.classList.remove("hidden");
  loadingOverlay.setAttribute("aria-hidden", "false");

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      body: formData
    });

    const contentType = response.headers.get("content-type") || "";
    let result = {};

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      console.error("Inventory API error response:", response.status, response.statusText, bodyText);
      throw new Error("Upload failed");
    }

    if (contentType.includes("application/json")) {
      result = await response.json().catch(() => ({}));
    } else {
      const bodyText = await response.text().catch(() => "");
      if (bodyText.includes("Script function not found")) {
        throw new Error("Backend script missing doPost.");
      }
      if (bodyText.trim().startsWith("<")) {
        console.error("Inventory API returned HTML instead of JSON:", bodyText.slice(0, 500));
        throw new Error("Invalid backend response.");
      }
    }

    showToast("Inventory saved successfully.", "success");
    inventoryForm.reset();
    imagePreview.classList.add("hidden");
    imagePreview.innerHTML = "";
  } catch (error) {
    console.error("Inventory submit failed:", error);
    showToast(error.message || "Could not save inventory. Try again later.", "error");
  } finally {
    loadingOverlay.classList.add("hidden");
    loadingOverlay.setAttribute("aria-hidden", "true");
  }
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

initInventory();
