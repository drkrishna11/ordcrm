# crm
Crm

## Backend requirements
This app expects a deployed Google Apps Script web app at the URL configured in `app.js` and `inventory.js`.

The script must expose:
- `function doGet(e) { ... }` for GET requests
- `function doPost(e) { ... }` for POST requests

If the script is not deployed or `doPost` is missing, the frontend will receive an HTML error page instead of JSON.
Hello