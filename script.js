/* ==========================================================
   Body Scent — shared script (used by every page)
   - product.html : load products.json, mood filter, order links
   - order.html   : auto-fill #items / #total, submit to Apps Script
   - admin.html   : read published Google Sheet CSV into a table
   ========================================================== */

(function () {
  "use strict";

  /* ---------- Config ---------- */
  var ORDER_ENDPOINT =
    "https://script.google.com/macros/s/AKfycbxdckPTML9lA3Owb__va6jA1sLFS-fMpHAjoFZfWwoFD-OB7Th8A-Nu3j3dtqtKBDnreg/exec";

  var ORDERS_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSEcQkkBpmT3vLKoHakvJYxtkw8Ansl4RVpkkiK877iDsYT5Jml-G9YJWdO1kD0P_N_mQDKz2-nkKFT/pub?gid=0&single=true&output=csv";

  var MOODS = [
    { key: "all", label: "ทั้งหมด" },
    { key: "fresh", label: "Fresh" },
    { key: "sweet", label: "Sweet" },
    { key: "confident", label: "Confident" },
    { key: "romance", label: "Romance" }
  ];

  /* ---------- Helpers ---------- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function formatPrice(n) {
    return Number(n).toLocaleString("th-TH") + " บาท";
  }

  function setValue(node, value) {
    if (!node) return;
    if ("value" in node) node.value = value;
    else node.textContent = value;
  }

  function getValue(id) {
    var node = document.getElementById(id);
    if (!node) return "";
    return ("value" in node ? node.value : node.textContent).trim();
  }

  /* ==========================================================
     1) product.html
     ========================================================== */
  function initProductPage() {
    var filterBar = document.getElementById("filter-bar");
    var list = document.getElementById("product-list");
    if (!filterBar || !list) return;

    var products = [];
    var currentMood = "all";

    var requested = new URLSearchParams(window.location.search).get("mood");
    if (requested) {
      requested = requested.toLowerCase();
      var valid = MOODS.some(function (m) { return m.key === requested; });
      if (valid) currentMood = requested;
    }

    function buildFilterBar() {
      filterBar.innerHTML = "";
      MOODS.forEach(function (m) {
        var btn = el("button", "filter-btn", m.label);
        btn.type = "button";
        btn.dataset.mood = m.key;
        btn.addEventListener("click", function () {
          currentMood = m.key;
          updateFilterState();
          renderProducts();
        });
        filterBar.appendChild(btn);
      });
      updateFilterState();
    }

    function updateFilterState() {
      Array.prototype.forEach.call(filterBar.children, function (btn) {
        var active = btn.dataset.mood === currentMood;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }

    function orderUrl(p) {
      var itemName = p.name + (p.size ? " " + p.size : "");
      return (
        "order.html?item=" + encodeURIComponent(itemName) +
        "&price=" + encodeURIComponent(p.price)
      );
    }

    function buildCard(p) {
      var card = el("article", "product-card");
      card.dataset.mood = p.mood;

      var img = el("img", "product-image");
      img.src = p.image;
      img.alt = p.name;
      img.loading = "lazy";
      card.appendChild(img);

      var body = el("div", "product-body");

      var title = el("h3", "product-name");
      title.appendChild(el("span", "mood-dot"));
      title.appendChild(document.createTextNode(p.name));
      body.appendChild(title);

      body.appendChild(el("span", "mood-line"));

      if (p.size) {
        body.appendChild(el("p", "product-meta", "ขนาด " + p.size));
      }

      body.appendChild(el("div", "product-price", formatPrice(p.price)));

      var btn = el("a", "btn btn-small", "สั่งซื้อ");
      btn.href = orderUrl(p);
      body.appendChild(btn);

      card.appendChild(body);
      return card;
    }

    function renderProducts() {
      list.innerHTML = "";
      var shown = products.filter(function (p) {
        return currentMood === "all" || p.mood === currentMood;
      });

      if (!shown.length) {
        list.appendChild(el("p", "empty-state", "ยังไม่มีสินค้าในหมวดนี้"));
        return;
      }
      shown.forEach(function (p) { list.appendChild(buildCard(p)); });
    }

    buildFilterBar();

    fetch("products.json")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        products = data;
        renderProducts();
      })
      .catch(function (err) {
        console.error(err);
        list.innerHTML = "";
        list.appendChild(
          el("p", "empty-state", "โหลดข้อมูลสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
        );
      });
  }

  /* ==========================================================
     2) order.html
     ========================================================== */
  function initOrderPage() {
    var form = document.getElementById("orderForm");
    if (!form) return;

    // Auto-fill items + total from URL parameters
    var params = new URLSearchParams(window.location.search);
    var item = params.get("item");
    var price = params.get("price");

    if (item) setValue(document.getElementById("items"), item);
    if (price) setValue(document.getElementById("total"), price);

    // Submit
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var payload = {
        customerName: getValue("customerName"),
        contact: getValue("contact"),
        items: getValue("items"),
        total: getValue("total"),
        note: getValue("note")
      };

      var submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      fetch(ORDER_ENDPOINT, {
        method: "POST",
        body: JSON.stringify(payload)
      })
        .then(function () {
          window.location.href = "thankyou.html";
        })
        .catch(function (error) {
          console.error(error);
          alert("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

  /* ==========================================================
     3) admin.html
     ========================================================== */

  // Minimal CSV parser: handles quoted fields, "" escapes,
  // commas / line breaks inside quotes, CRLF and a leading BOM.
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }

    // last field / row
    if (field !== "" || row.length) {
      row.push(field);
      rows.push(row);
    }

    // drop completely empty rows
    return rows.filter(function (r) {
      return r.some(function (cell) { return cell.trim() !== ""; });
    });
  }

  function initAdminPage() {
    var tbody = document.querySelector("#ordersTable tbody");
    if (!tbody) return;

    var COLS = 6;

    function showMessage(msg) {
      tbody.innerHTML = "";
      var tr = el("tr");
      var td = el("td", "empty-state", msg);
      td.colSpan = COLS;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    showMessage("กำลังโหลดข้อมูล...");

    var url = ORDERS_CSV_URL + "&_=" + Date.now(); // avoid cached copy

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (text) {
        var rows = parseCSV(text);
        rows.shift(); // header row

        if (!rows.length) {
          showMessage("ยังไม่มีรายการสั่งซื้อ");
          return;
        }

        // newest first (sheet appends new orders at the bottom)
        rows.reverse();

        tbody.innerHTML = "";
        rows.forEach(function (r) {
          var tr = el("tr");
          for (var i = 0; i < COLS; i++) {
            tr.appendChild(el("td", "", r[i] !== undefined ? r[i] : ""));
          }
          tbody.appendChild(tr);
        });
      })
      .catch(function (err) {
        console.error(err);
        showMessage("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      });
  }

  /* ---------- Boot ---------- */
  function init() {
    initProductPage();
    initOrderPage();
    initAdminPage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
