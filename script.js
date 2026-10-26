(function () {
  "use strict";

  function evaluate(src) {
    var toks = src.match(/\d+\.?\d*|\.\d+|[+−×÷^()%√]/g) || [];
    var i = 0;
    function peek() {
      return toks[i];
    }
    function next() {
      return toks[i++];
    }
    function expr() {
      var l = term();
      while (peek() === "+" || peek() === "−") {
        var op = next(),
          r = term();
        var rv = r.pct ? l.v * r.v : r.v;
        l = { v: op === "+" ? l.v + rv : l.v - rv, pct: false };
      }
      return l;
    }
    function term() {
      var l = factor();
      while (peek() === "×" || peek() === "÷") {
        var op = next(),
          r = factor();
        if (op === "÷" && r.v === 0) throw new Error("DIV");
        l = { v: op === "×" ? l.v * r.v : l.v / r.v, pct: false };
      }
      return l;
    }
    function factor() {
      var b = unary();
      if (peek() === "^") {
        next();
        var e = factor();
        return { v: Math.pow(b.v, e.v), pct: false };
      }
      return b;
    }
    function unary() {
      if (peek() === "−") {
        next();
        var u = unary();
        return { v: -u.v, pct: u.pct };
      }
      if (peek() === "+") {
        next();
        return unary();
      }
      return postfix();
    }
    function postfix() {
      var p = primary(),
        pct = false;
      while (peek() === "%") {
        next();
        p = { v: p.v / 100 };
        pct = true;
      }
      return { v: p.v, pct: pct };
    }
    function primary() {
      var t = next();
      if (t === undefined) throw new Error("SYNTAX");
      if (t === "(") {
        var e = expr();
        if (next() !== ")") throw new Error("SYNTAX");
        return { v: e.v };
      }
      if (t === "√") {
        var u = unary();
        if (u.v < 0) throw new Error("DOMAIN");
        return { v: Math.sqrt(u.v) };
      }
      if (/^[\d.]/.test(t)) return { v: parseFloat(t) };
      throw new Error("SYNTAX");
    }
    var out = expr();
    if (i < toks.length) throw new Error("SYNTAX");
    if (!isFinite(out.v) || isNaN(out.v)) throw new Error("DOMAIN");
    return out.v;
  }
  function valToStr(v) {
    var r = Number(v.toPrecision(12));
    if (r === 0) return "0";
    var s = Math.abs(r).toLocaleString("en-US", {
      useGrouping: false,
      maximumFractionDigits: 20,
    });
    return (r < 0 ? "−" : "") + s;
  }
  function prepare(src) {
    var s = src,
      prev;
    do {
      prev = s;
      s = s.replace(/[+−×÷^]+$/, "");
      if (/√\($/.test(s)) s = s.slice(0, -2);
      else if (/\($/.test(s)) s = s.slice(0, -1);
    } while (s !== prev);
    if (!s) return "";
    var open = (s.match(/\(/g) || []).length - (s.match(/\)/g) || []).length;
    for (var k = 0; k < open; k++) s += ")";
    return s;
  }
  function tryEval(src) {
    var p = prepare(src);
    if (!p) return null;
    try {
      return valToStr(evaluate(p));
    } catch (e) {
      return null;
    }
  }
  window.__calc = { evaluate: evaluate, valToStr: valToStr, prepare: prepare };

  /* ---------- State ---------- */
  var expr = "",
    lastExpr = "",
    done = false,
    err = "";
  var history = [];
  try {
    history = JSON.parse(localStorage.getItem("dc12-tape") || "[]").slice(
      0,
      30,
    );
  } catch (e) {
    history = [];
  }

  var elExpr = document.getElementById("expr");
  var elRes = document.getElementById("result");
  var elToast = document.getElementById("toast");
  var elList = document.getElementById("tapeList");
  var elEmpty = document.getElementById("tapeEmpty");

  function groupInt(s) {
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function fmt(str) {
    return str.replace(/\d+(\.\d*)?/g, function (m) {
      var p = m.split(".");
      return groupInt(p[0]) + (p.length > 1 ? "." + p[1] : "");
    });
  }
  function pretty(str) {
    return fmt(str).replace(/([0-9)%])([+−×÷^])/g, "$1 $2 ");
  }
  function isPlain(s) {
    return /^−?[0-9.]+$/.test(s);
  }
  function lastChar() {
    return expr.slice(-1);
  }
  function endsValue() {
    return /[0-9)%.]$/.test(expr);
  }
  function startFresh() {
    if (done) {
      expr = "";
      done = false;
    }
  }

  /* ---------- Actions ---------- */
  function digit(d) {
    startFresh();
    if (/[)%]$/.test(expr)) expr += "×";
    if (/(^|[^0-9.])0$/.test(expr)) expr = expr.slice(0, -1) + d;
    else expr += d;
  }
  function dot() {
    startFresh();
    if (/[)%]$/.test(expr)) expr += "×";
    if (!/[0-9.]$/.test(expr)) {
      expr += "0.";
      return;
    }
    var cur = expr.match(/[0-9.]+$/)[0];
    if (cur.indexOf(".") === -1) expr += ".";
  }
  function operator(op) {
    done = false;
    if (expr === "") {
      expr = op === "−" ? "−" : "0" + op;
      return;
    }
    if (expr === "−") return;
    if (/\($/.test(expr)) {
      if (op === "−") expr += op;
      return;
    }
    if (/[+−×÷^]$/.test(expr)) {
      if (op === "−" && /[×÷^]$/.test(expr)) {
        expr += op;
        return;
      }
      expr = expr.replace(/[+−×÷^]+$/, "") + op;
      return;
    }
    expr += op;
  }
  function paren(p) {
    if (p === "(") {
      startFresh();
      if (/[0-9)%.]$/.test(expr)) expr += "×";
      expr += "(";
    } else {
      var open =
        (expr.match(/\(/g) || []).length - (expr.match(/\)/g) || []).length;
      if (open > 0 && endsValue()) {
        done = false;
        expr += ")";
      }
    }
  }
  function sqrt() {
    startFresh();
    if (/[0-9)%.]$/.test(expr)) expr += "×";
    expr += "√(";
  }
  function percent() {
    if (/[0-9)%]$/.test(expr)) {
      done = false;
      expr += "%";
    }
  }
  function backspace() {
    done = false;
    if (/√\($/.test(expr)) expr = expr.slice(0, -2);
    else expr = expr.slice(0, -1);
  }
  function negate() {
    if (!expr) return;
    if (done) {
      expr = expr.charAt(0) === "−" ? expr.slice(1) : "−" + expr;
      return;
    }
    var m = expr.match(/\(−([0-9.]+)\)$/);
    if (m) {
      expr = expr.slice(0, m.index) + m[1];
      return;
    }
    m = expr.match(/[0-9.]+$/);
    if (m) expr = expr.slice(0, m.index) + "(−" + m[0] + ")";
  }
  function equals() {
    var p = prepare(expr);
    if (!p || isPlain(p)) return;
    try {
      var res = valToStr(evaluate(p));
      history.unshift({ e: p, r: res });
      history = history.slice(0, 30);
      saveTape();
      lastExpr = p;
      expr = res;
      done = true;
    } catch (e) {
      err =
        e.message === "DIV"
          ? "Cannot divide by zero"
          : e.message === "DOMAIN"
            ? "Not a real number"
            : "Invalid expression";
    }
  }
  function act(k) {
    if (err) err = "";
    if (/^[0-9]$/.test(k)) digit(k);
    else if (k === ".") dot();
    else if (/^[+−×÷^]$/.test(k)) operator(k);
    else if (k === "(" || k === ")") paren(k);
    else if (k === "√") sqrt();
    else if (k === "%") percent();
    else if (k === "bs") backspace();
    else if (k === "ac") {
      expr = "";
      lastExpr = "";
      done = false;
    } else if (k === "neg") negate();
    else if (k === "eq") equals();
    render();
  }

  /* ---------- Rendering ---------- */
  function fit() {
    var size = window.innerWidth < 420 ? 40 : 48;
    elRes.style.fontSize = size + "px";
    if (elRes.classList.contains("error")) {
      elRes.style.fontSize = "";
      return;
    }
    while (elRes.scrollWidth > elRes.clientWidth && size > 16) {
      size -= 2;
      elRes.style.fontSize = size + "px";
    }
  }
  function render() {
    elRes.className = "result";
    var line = "",
      main = "0";
    if (err) {
      line = pretty(expr);
      main = err;
      elRes.classList.add("error");
    } else if (done) {
      line = pretty(lastExpr) + " =";
      main = fmt(expr);
    } else if (expr === "") {
      line = "";
      main = "0";
    } else if (isPlain(expr)) {
      line = "";
      main = fmt(expr);
    } else {
      line = pretty(expr);
      var live = tryEval(expr);
      main = live === null ? "0" : fmt(live);
      if (live !== null) elRes.classList.add("live");
    }
    elExpr.textContent = line || " ";
    elExpr.scrollLeft = elExpr.scrollWidth;
    elRes.textContent = main;
    fit();
    if (expr === "" && !err)
      elRes.setAttribute("aria-label", "Result 0. Press to copy.");
    else
      elRes.setAttribute("aria-label", "Result " + main + ". Press to copy.");
  }
  function saveTape() {
    try {
      localStorage.setItem("dc12-tape", JSON.stringify(history));
    } catch (e) {}
  }
  function renderTape() {
    elList.innerHTML = "";
    history.forEach(function (h) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tape-item";
      var a = document.createElement("span");
      a.className = "te";
      a.textContent = pretty(h.e) + " =";
      var c = document.createElement("span");
      c.className = "tr";
      c.textContent = fmt(h.r);
      b.appendChild(a);
      b.appendChild(c);
      b.addEventListener("click", function () {
        err = "";
        expr = h.r;
        lastExpr = h.e;
        done = true;
        render();
      });
      li.appendChild(b);
      elList.appendChild(li);
    });
    elEmpty.hidden = history.length > 0;
  }
  var origSave = saveTape;
  saveTape = function () {
    origSave();
    renderTape();
  };

  /* ---------- Wiring ---------- */
  document.getElementById("pad").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-k]");
    if (b) act(b.getAttribute("data-k"));
  });
  document.getElementById("clearTape").addEventListener("click", function () {
    history = [];
    saveTape();
  });
  elRes.addEventListener("click", function () {
    var text = elRes.textContent.replace(/,/g, "").replace(/−/g, "-");
    if (err || !text) return;
    function ok() {
      elToast.classList.add("on");
      setTimeout(function () {
        elToast.classList.remove("on");
      }, 1000);
    }
    try {
      navigator.clipboard.writeText(text).then(ok, function () {});
    } catch (e) {}
  });

  var KEYMAP = {
    "*": "×",
    x: "×",
    X: "×",
    "/": "÷",
    "-": "−",
    ",": ".",
    Enter: "eq",
    "=": "eq",
    Backspace: "bs",
    Escape: "ac",
    Delete: "ac",
  };
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    var m = KEYMAP[k] || k;
    var valid =
      /^[0-9]$/.test(m) ||
      /^[.+−×÷^()%]$/.test(m) ||
      m === "eq" ||
      m === "bs" ||
      m === "ac";
    if (!valid) return;
    e.preventDefault();
    var btn = document.querySelector('button[data-k="' + m + '"]');
    if (btn) {
      btn.classList.add("hit");
      setTimeout(function () {
        btn.classList.remove("hit");
      }, 120);
    }
    act(m);
  });
  window.addEventListener("resize", fit);

  renderTape();
  render();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
})();
