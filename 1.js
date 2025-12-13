// --- 核心工具函数 ---
let behaviorCanvas = null;
let ctx = null;
// 此处假设 behaviorCanvas 变量最终会通过 DOMContentLoaded 后的 main 函数赋值给 document.getElementById("behavior-canvas")
// 因为在代码片段的顶部，behaviorCanvas 是 null，所以 ctx 也是 null。这在 main 中被修复。

const $ = (id) => document.getElementById(id);
const createEl = (tag, className) => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
};

// --- 1. 高级指纹采集  ---

// 音频指纹 (AudioContext Fingerprinting)
async function getAudioFingerprint() {
  try {
    const ctx = new (window.OfflineAudioContext ||
      window.webkitOfflineAudioContext)(1, 44100, 44100);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(10000, ctx.currentTime);
    const compressor = ctx.createDynamicsCompressor();

    osc.connect(compressor);
    compressor.connect(ctx.destination);
    osc.start(0);

    const buffer = await ctx.startRendering();
    const data = buffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += Math.abs(data[i]);
    }
    return sum.toString().slice(0, 15) + " (音频栈哈希)";
  } catch (e) {
    return "Blocked/Not Supported";
  }
}

// Canvas 指纹 (更隐蔽的绘图)
function getCanvasFingerprint() {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = 200;
  canvas.height = 50;
  ctx.textBaseline = "top";
  ctx.font = "14px 'Arial'";
  ctx.fillStyle = "#f60";
  ctx.fillRect(125, 1, 62, 20);
  ctx.fillStyle = "#069";
  ctx.fillText("Browser Leak", 2, 15);
  ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
  ctx.fillText("Browser Leak", 4, 17);
  return canvas.toDataURL().slice(-30) + "..."; // 仅展示一部分
}

// WebGL/GPU 深度信息 
function getGPUDeepInfo() {
  const canvas = document.createElement("canvas");
  const gl =
    canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
  if (!gl)
    return { renderer: "不支持", vendor: "不支持", reportHash: "不支持" };

  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const vendor = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
    : "未知";
  const renderer = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : "未知";

  // WebGL Report: 查询数百个参数
  const params = [
    gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS,
    gl.MAX_CUBE_MAP_TEXTURE_SIZE,
    gl.MAX_RENDERBUFFER_SIZE,
    gl.MAX_TEXTURE_SIZE,
    gl.VERSION,
    gl.SHADING_LANGUAGE_VERSION,
    // 实际应用会查询数百个参数
  ];
  let reportString = params.join("|");

  // 简易哈希函数 (模拟)
  let hash = 0;
  for (let i = 0; i < reportString.length; i++) {
    const char = reportString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }

  return {
    vendor: vendor,
    renderer: renderer,
    reportHash: "WGL-" + Math.abs(hash).toString(16),
  };
}

// 字体指纹 (Font Enumeration)
function getFontFingerprint() {
  const fontList = [
    "Arial",
    "Verdana",
    "Times New Roman",
    "Courier New",
    "Georgia",
    "Trebuchet MS",
    "Comic Sans MS",
    "Impact",
    "Lucida Sans Unicode",
    "Tahoma",
    "Consolas",
    "Monaco",
    "Source Code Pro",
    "PingFang SC",
    "Microsoft YaHei",
  ];
  let availableFonts = [];
  const testText = "mmmmmmmmmmlli"; // 用于测量宽度的测试字符串
  const testSize = "12px ";

  // 测量一个基准宽度（例如，使用默认的 sans-serif）
  const getWidth = (font) => {
    const span = document.createElement("span");
    span.style.cssText = `font-size: ${testSize}; font-family: ${font};`;
    span.textContent = testText;
    document.body.appendChild(span);
    const width = span.offsetWidth;
    document.body.removeChild(span);
    return width;
  };

  // 确保 DOM 存在
  if (!document.body) return "Error: DOM not ready";

  // 追踪者会用一个基准字体宽度来判断其他字体是否可用
  // 由于此代码运行在 DOMContentLoaded 后，应该能正常工作
  fontList.forEach((font) => {
    // 实际的字体指纹技术会更复杂，这里仅作演示
    // 假设如果宽度不同于基准（例如'monospace'），则该字体可能存在
    // 简单起见，我们仅列举并生成一个基于列表的哈希
    if (document.fonts.check(`${testSize}${font}`)) {
      availableFonts.push(font.replace(/\s/g, ""));
    }
  });

  const fontString = availableFonts.sort().join("|");
  let hash = 0;
  for (let i = 0; i < fontString.length; i++) {
    const char = fontString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }

  return `FNT-${Math.abs(hash).toString(16)} (检测到 ${
    availableFonts.length
  } 字体)`;
}

// DOM/API 差异指纹
function getAPIDifferenceFingerprint() {
  const coreProperties = [
    "window",
    "document",
    "navigator",
    "console",
    "fetch",
    "Array",
  ];
  let nonStandardProps = [];

  for (let prop in window) {
    if (
      typeof window[prop] !== "function" &&
      !coreProperties.includes(prop) &&
      !prop.startsWith("webkit")
    ) {
      // 收集非标准属性名称
      nonStandardProps.push(prop);
    }
  }

  const propString = nonStandardProps.sort().slice(0, 30).join("|"); // 仅取前30个用于演示
  return `APIDiff: ${propString.slice(0, 50)}...`;
}

// WebRTC 泄露检测 (局域网 IP)
async function getLocalIPs() {
  return new Promise((resolve) => {
    if (!window.RTCPeerConnection) {
      resolve("WebRTC 不支持/已禁用");
      return;
    }
    const ips = [];
    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.createDataChannel("");
    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .catch(() => {});
    pc.onicecandidate = (ice) => {
      if (!ice || !ice.candidate || !ice.candidate.candidate) {
        pc.close();
        resolve(ips.length ? ips.join(", ") : "未检测到 (可能被浏览器屏蔽)");
        return;
      }
      const parts = ice.candidate.candidate.split(" ");
      const ip = parts[4];
      if (ip && ip.indexOf(".") > 0 && ip !== "0.0.0.0") {
        if (!ips.includes(ip)) ips.push(ip);
      }
    };
  });
}

// --- 1.5 新增：高级指纹及设备特征 ---

// 新增：媒体编解码器支持指纹
function getMediaCodecFingerprint() {
  if (!("MediaCapabilities" in window)) return "API 不支持";

  // 常见的视频/音频类型
  const videoCodecs = ["vp9", "h.264", "hevc", "av1"];
  const audioCodecs = ["mp3", "aac", "opus"];
  let supportedList = [];

  // 这是一个同步函数，但实际的 checkDecodingSupport 是异步的
  // 这里我们使用一个简化的同步检查 (canPlayType) 来演示
  
  videoCodecs.forEach(codec => {
    const mime = `video/mp4; codecs="${codec}"`;
    if (document.createElement('video').canPlayType(mime) === 'probably') {
      supportedList.push(codec);
    }
  });
  audioCodecs.forEach(codec => {
    const mime = `audio/mp4; codecs="${codec}"`;
    if (document.createElement('audio').canPlayType(mime) === 'probably') {
      supportedList.push(codec);
    }
  });

  // 生成哈希
  const codecString = supportedList.sort().join("|");
  let hash = 0;
  for (let i = 0; i < codecString.length; i++) {
    const char = codecString.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }

  return `CDC-${Math.abs(hash).toString(16)} (支持 ${supportedList.length} 编解码器)`;
}


// 系统 UI 偏好 
function getSystemUIPrefers() {
  // 深色模式检测
  const isDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;

  // 减少运动检测 (例如减少动画)
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return {
    colorScheme: isDarkMode ? "深色模式 (Dark)" : "浅色模式 (Light)",
    reducedMotion: prefersReducedMotion ? "✅ 减少运动" : "❌ 正常运动",
  };
}

// 传感器支持性检测 (无需授权)
function getSensorSupport() {
  const support = {};
  support.magnetometer = "Magnetometer" in window ? "✅ 支持" : "❌ 不支持";
  support.proximity = "ProximitySensor" in window ? "✅ 支持" : "❌ 不支持";
  support.ambientLight = "AmbientLightSensor" in window ? "✅ 支持" : "❌ 不支持";
  
  // 检查陀螺仪 (需要权限，但检查支持性不需要)
  support.gyroscope = "Gyroscope" in window ? "✅ 支持" : "❌ 不支持"; 
  
  return support;
}



// --- 2. 行为生物识别  ---
const behaviorData = {
  mousePath: [],
  clicks: 0,
  keystrokes: 0,
  scrolls: 0,
  startTime: Date.now(),
  keyDownTime: {},
  keyHoldTimes: [],
  keyIntervals: [],
  lastKeyDown: 0,
  touchPath: [],
  touchCount: 0, 
  currentTouches: 0, 
};

function initBehaviorTracking() {
  function resize() {
    if (behaviorCanvas) {
      behaviorCanvas.width = window.innerWidth;
      behaviorCanvas.height = window.innerHeight;
    }
  }
  window.onresize = resize;
  resize();

  // 鼠标追踪可视化
  document.addEventListener("mousemove", (e) => {
    const x = e.clientX;
    const y = e.clientY;

    behaviorData.mousePath.push({ x, y, t: Date.now() });
    if (behaviorData.mousePath.length > 50) behaviorData.mousePath.shift();

    updateVal("mouse-pos", `${e.clientX}, ${e.clientY}`);
    updateVal("mouse-speed", calculateSpeed());
    updateVal("mouse-path-len", behaviorData.mousePath.length);
  });

  document.addEventListener("click", () => {
    behaviorData.clicks++;
    updateVal("click-count", behaviorData.clicks);
  });

  // --- 触控追踪 (Touch Tracking) ---
  document.addEventListener(
    "touchstart",
    (e) => {
      behaviorData.touchCount++;
      behaviorData.currentTouches = e.touches.length;
      updateVal("touch-count", behaviorData.touchCount);
      updateVal("current-touches", behaviorData.currentTouches);

      if (e.touches.length > 0) {
        const touch = e.touches[0];
        behaviorData.touchPath.push({
          x: touch.clientX,
          y: touch.clientY,
          t: Date.now(),
        });
        if (behaviorData.touchPath.length > 50) {
          behaviorData.touchPath.shift();
        }
        updateVal("touch-pos", `${touch.clientX}, ${touch.clientY}`);
      }
    },
    { passive: true }
  ); 

  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        behaviorData.touchPath.push({
          x: touch.clientX,
          y: touch.clientY,
          t: Date.now(),
        });

        if (behaviorData.touchPath.length > 50) {
          behaviorData.touchPath.shift();
        }

        updateVal("touch-pos", `${touch.clientX}, ${touch.clientY}`);
        updateVal("current-touches", e.touches.length);
        updateVal("touch-speed", calculateTouchSpeed());
      }
    },
    { passive: true }
  );

  document.addEventListener(
    "touchend",
    (e) => {
      behaviorData.currentTouches = e.touches.length;
      updateVal("current-touches", behaviorData.currentTouches);
    },
    { passive: true }
  );

  // 键盘事件
  document.addEventListener("keydown", (e) => {
    if (!e.repeat) {
      behaviorData.keystrokes++;
      const now = Date.now();

      if (behaviorData.lastKeyDown !== 0) {
        const interval = now - behaviorData.lastKeyDown;
        behaviorData.keyIntervals.push(interval);
        updateVal(
          "key-interval-avg",
          calculateAverage(behaviorData.keyIntervals) + " ms"
        );
      }

      behaviorData.keyDownTime[e.code] = now; 
      behaviorData.lastKeyDown = now;

      updateVal("key-count", behaviorData.keystrokes);
      updateVal("last-key", e.code);
    }
  });

  document.addEventListener("keyup", (e) => {
    const upTime = Date.now();
    const downTime = behaviorData.keyDownTime[e.code];

    if (downTime) {
      const holdTime = upTime - downTime;
      behaviorData.keyHoldTimes.push(holdTime);
      delete behaviorData.keyDownTime[e.code]; 

      updateVal(
        "key-hold-avg",
        calculateAverage(behaviorData.keyHoldTimes) + " ms"
      );
      updateVal("last-hold-time", holdTime + " ms");
    }
  });

  document.addEventListener("scroll", () => {
    behaviorData.scrolls++;
    updateVal("scroll-count", behaviorData.scrolls);
  });
}

function calculateSpeed() {
  if (behaviorData.mousePath.length < 2) return "0 px/ms";
  const last = behaviorData.mousePath[behaviorData.mousePath.length - 1];
  const prev = behaviorData.mousePath[behaviorData.mousePath.length - 2];
  const dist = Math.sqrt(
    Math.pow(last.x - prev.x, 2) + Math.pow(last.y - prev.y, 2)
  );
  const time = last.t - prev.t;
  return time > 0 ? (dist / time).toFixed(2) + " px/ms" : "0";
}

function calculateAverage(arr) {
  if (arr.length === 0) return 0;
  const sum = arr.reduce((a, b) => a + b, 0);
  return (sum / arr.length).toFixed(1);
}

function calculateTouchSpeed() {
  if (behaviorData.touchPath.length < 2) return "0 px/ms";
  const last = behaviorData.touchPath[behaviorData.touchPath.length - 1];
  const prev = behaviorData.touchPath[behaviorData.touchPath.length - 2];
  const dist = Math.sqrt(
    Math.pow(last.x - prev.x, 2) + Math.pow(last.y - prev.y, 2)
  );
  const time = last.t - prev.t;
  return time > 0 ? (dist / time).toFixed(2) + " px/ms" : "0";
}

function renderPaths() {
  if (!ctx || !behaviorCanvas) {
    requestAnimationFrame(renderPaths); 
    return;
  }

  ctx.clearRect(0, 0, behaviorCanvas.width, behaviorCanvas.height);
  // 绘制鼠标路径 (红色)
  drawPath(behaviorData.mousePath, "rgba(255, 51, 51, 0.5)");

  // 绘制触控路径 (蓝色/绿色 )
  drawPath(behaviorData.touchPath, "rgba(51, 153, 255, 0.5)");

  requestAnimationFrame(renderPaths); 
}

function drawPath(path, color) {
  if (path.length > 1) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.moveTo(path[0].x, path[0].y);
    for (let p of path) {
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

// --- 3. 渲染逻辑 (保持不变) ---

function createCard(title, id, rows, isFullWidth = false) {
  const card = createEl("div", "card");
  if (isFullWidth) card.style.gridColumn = "1 / -1";

  const h2 = createEl("h2");
  h2.innerText = title;
  card.appendChild(h2);

  rows.forEach((row) => {
    const div = createEl("div", "data-row");
    const k = createEl("span", "key");
    k.innerText = row.label;
    const v = createEl("span", "val");
    v.id = row.id || `data-${Math.random().toString(36).substr(2, 9)}`;
    v.innerHTML = row.val || "检测中...";
    if (row.danger) v.classList.add("danger");

    div.appendChild(k);
    div.appendChild(v);
    card.appendChild(div);
  });

  $("dashboard").appendChild(card);
}

function updateVal(id, val) {
  const el = $(id);
  if (el) el.innerText = val;
}

// --- 主程序 ---
async function main() {
  $("timestamp").innerText = new Date().toLocaleString();
  const gpuInfo = getGPUDeepInfo();
  const fontFP = getFontFingerprint();
  const apiFP = getAPIDifferenceFingerprint();
  const uiPref = getSystemUIPrefers();
  const sensorSupport = getSensorSupport();

  // 1. 身份与指纹 (The Fingerprint)
  createCard("🆔 唯一性指纹 (Fingerprinting)", "fp-card", [
    { label: "Canvas 哈希", val: getCanvasFingerprint(), danger: true },
    { label: "音频上下文哈希", id: "audio-fp", val: "计算中..." },
    { label: "字体指纹 ", val: fontFP, danger: true }, 
    { label: "媒体编解码器指纹", val: getMediaCodecFingerprint(), danger: true },
    { label: "浏览器 API 差异", val: apiFP }, 
    { label: "User Agent", val: navigator.userAgent },
    {
      label: "硬件并发数 (CPU)",
      val: navigator.hardwareConcurrency + " 核",
    },
    {
      label: "屏幕分辨率",
      val: `${screen.width}x${screen.height} (色深:${screen.colorDepth}bit)`,
    },
    {
      label: "系统 UI 颜色偏好", 
      val: uiPref.colorScheme,
    },
    {
      label: "系统 UI 运动偏好", 
      val: uiPref.reducedMotion,
    },
    {
      label: "时区",
      val: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    { label: "系统语言", val: navigator.languages.join(", ") },
  ]);

  // 2. 网络暴露 (Network Leaks)
  createCard("🌐 网络连接暴露", "net-card", [
    { label: "公网 IP", id: "public-ip", val: "查询中..." },
    {
      label: "地理位置 (城市/国家)",
      id: "ip-location",
      val: "查询中...",
    }, 
    { label: "互联网服务商 (ISP)", id: "ip-isp", val: "查询中..." },
    {
      label: "WebRTC 局域网 IP",
      id: "local-ip",
      val: "探测中...",
      danger: true,
    },
    {
      label: "是否使用代理/VPN",
      id: "proxy-check",
      val: "分析中...",
    }, 
  ]);

  // 3. 硬件透视 (Hardware X-Ray)
  createCard("⚙️ 硬件透视 & 传感器", "hw-card", [
    { label: "GPU 供应商", val: gpuInfo.vendor },
    { label: "GPU 渲染器", val: gpuInfo.renderer, danger: true },
    {
      label: "WebGL 能力报告哈希 ",
      val: gpuInfo.reportHash,
      danger: true,
    }, 
    {
      label: "设备内存 (RAM)",
      val: navigator.deviceMemory ? `~${navigator.deviceMemory} GB` : "未知",
    },
    { label: "电池状态 (Level)", id: "battery-stat", val: "获取中..." },
    { label: "电池充电时间", id: "battery-charge-time", val: "获取中..." }, 
    { label: "电池放电时间", id: "battery-discharge-time", val: "获取中..." }, 
    { label: "环境光传感器支持", val: sensorSupport.ambientLight },
    { label: "近距离传感器支持", val: sensorSupport.proximity },
    { label: "陀螺仪支持", val: sensorSupport.gyroscope }, 
  ]);

  // 4. 行为生物识别 (实时) 
  createCard(
    "🖱️ 实时行为生物识别",
    "bio-card",
    [
      { label: "当前鼠标坐标", id: "mouse-pos", val: "0, 0" },
      { label: "移动速度 (反应力)", id: "mouse-speed", val: "0 px/ms" },
      { label: "鼠标路径长度 (50点)", id: "mouse-path-len", val: "0" }, 
      { label: "点击次数", id: "click-count", val: "0" },
      { label: "按键次数", id: "key-count", val: "0" },
      { label: "最近按键", id: "last-key", val: "None" },
      {
        label: "平均按键保持时间 ",
        id: "key-hold-avg",
        val: "N/A",
      }, 
      {
        label: "平均按键间隔 ",
        id: "key-interval-avg",
        val: "N/A",
      }, 
      {
        label: "设备支持触控",
        val: "ontouchstart" in window ? "✅ 是" : "❌ 否",
      }, 
      { label: "触控开始次数 ", id: "touch-count", val: "0" },
      { label: "当前触控点数 ", id: "current-touches", val: "0" },
      { label: "最近触控坐标", id: "touch-pos", val: "N/A" },
      { label: "触控速度 ", id: "touch-speed", val: "0 px/ms" },
      { label: "滚动距离", id: "scroll-count", val: "0" },
    ],
    true
  );

  // 找到 canvas 元素并设置样式（如果它在 HTML 中）
    behaviorCanvas = $("behavior-canvas");
    if (behaviorCanvas) {
        ctx = behaviorCanvas.getContext("2d");
        behaviorCanvas.style.position = 'fixed';
        behaviorCanvas.style.top = '0';
        behaviorCanvas.style.left = '0';
        behaviorCanvas.style.zIndex = '9999'; 
        behaviorCanvas.style.pointerEvents = 'none'; 
    } else {
        console.error("Canvas element with ID 'behavior-canvas' not found. Mouse path rendering will be disabled.");
    }


  // 异步数据填充

  // 音频指纹
  getAudioFingerprint().then((fp) => updateVal("audio-fp", fp));

  // IP 地址和地理位置解析
  fetch("https://ipinfo.io/json", {
    signal: AbortSignal.timeout(5000), 
  })
    .then((r) => {
      if (!r.ok) {
        throw new Error(`HTTP Error: ${r.status}`);
      }
      return r.json();
    })
    .then((d) => {
      updateVal("public-ip", d.ip, "safe");
      const location = `${d.city || "未知城市"}, ${d.country || "未知国家"}`;
      updateVal("ip-location", location);
      updateVal("ip-isp", d.org || "未知"); 

      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const geoTime = d.timezone; 

      let proxyStatus = "未检测到异常";
      if (geoTime && geoTime !== timeZone) {
        proxyStatus = `⚠️ 时区不匹配! (IP: ${geoTime} vs. 浏览器: ${timeZone})`;
      } else if (!d.city) {
        proxyStatus = "高风险 (无法解析IP城市)";
      } else {
        proxyStatus = "低风险 (时区匹配)";
      }

      updateVal("proxy-check", proxyStatus);
    })
    .catch((e) => {
      let errorMsg = "请求失败";
      if (e.name === "AbortError") {
        errorMsg = "超时 (Timeout)";
      } else if (e.message.includes("HTTP Error")) {
        errorMsg = e.message;
      } else if (e.toString().includes("TypeError")) {
        errorMsg = "网络或CORS被严格拦截";
      }

      updateVal("public-ip", `获取失败 (${errorMsg})`, "danger");
      updateVal("ip-location", "获取失败");
      updateVal("ip-isp", "获取失败");
      updateVal("proxy-check", "无法判断 (公共IP获取失败)");
    });

  // 电池 
  if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
      // level
      const status = `${(b.level * 100).toFixed(0)}% ${
        b.charging ? "(充电中)" : "(放电中)"
      }`;
      updateVal("battery-stat", status);

      // 充电时间 (秒转换为分钟)
      const chargeTime = b.chargingTime === Infinity 
        ? "已充满或未知" 
        : `${(b.chargingTime / 60).toFixed(0)} 分钟`;
      updateVal("battery-charge-time", chargeTime);

      // 放电时间 (秒转换为小时)
      const dischargeTime = b.dischargingTime === Infinity 
        ? "充电中或未知" 
        : `${(b.dischargingTime / 3600).toFixed(1)} 小时`;
      updateVal("battery-discharge-time", dischargeTime);

      // 可以在这里添加监听器来持续更新，但在演示代码中，初始获取即可。
    });
  } else {
    updateVal("battery-stat", "API 不支持");
    updateVal("battery-charge-time", "API 不支持");
    updateVal("battery-discharge-time", "API 不支持");
  }

  // WebRTC 泄露
  getLocalIPs().then((ips) => updateVal("local-ip", ips));

  // 启动行为追踪和 Canvas 渲染
  initBehaviorTracking();
  renderPaths();
}

document.addEventListener("DOMContentLoaded", main);