const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const imageInput = document.getElementById("imageInput");
const toolButtons = document.querySelectorAll(".tool");
const modeButtons = document.querySelectorAll(".mode");
const toolHint = document.getElementById("toolHint");
const leftAngleEl = document.getElementById("leftAngle");
const rightAngleEl = document.getElementById("rightAngle");
const methodEl = document.getElementById("method");

const state = {
  image: null,
  scale: 1,
  offset: { x: 0, y: 0 },
  baseline: [],
  boundaryPoints: [],
  manualPoints: [],
  tool: "baseline",
  mode: "manual",
};

const hints = {
  baseline: "Select two points along the surface to define the baseline.",
  boundary:
    "Click along the droplet boundary to add points for best-fit modes.",
  manual:
    "Click four points: left contact, right contact, left tangent helper, right tangent helper.",
};

function setTool(tool) {
  state.tool = tool;
  toolButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tool === tool);
  });
  toolHint.textContent = hints[tool];
}

function setMode(mode) {
  state.mode = mode;
  modeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
}

toolButtons.forEach((btn) => {
  btn.addEventListener("click", () => setTool(btn.dataset.tool));
});

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

document.getElementById("clearPoints").addEventListener("click", () => {
  state.baseline = [];
  state.boundaryPoints = [];
  state.manualPoints = [];
  draw();
});

document.getElementById("resetView").addEventListener("click", () => {
  state.scale = 1;
  state.offset = { x: 0, y: 0 };
  draw();
});

imageInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    state.image = img;
    fitImage();
    draw();
  };
  img.src = URL.createObjectURL(file);
});

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (canvas.width / rect.width);
  const y = (event.clientY - rect.top) * (canvas.height / rect.height);
  const point = { x, y };

  if (state.tool === "baseline") {
    if (state.baseline.length >= 2) state.baseline = [];
    state.baseline.push(point);
  } else if (state.tool === "boundary") {
    state.boundaryPoints.push(point);
  } else if (state.tool === "manual") {
    if (state.manualPoints.length >= 4) state.manualPoints = [];
    state.manualPoints.push(point);
  }

  draw();
});

document.getElementById("analyze").addEventListener("click", () => {
  const baseline = state.baseline;
  if (baseline.length < 2) {
    alert("Please set a baseline with two points.");
    return;
  }

  let result = null;
  if (state.mode === "manual") {
    result = manualAngles();
  } else if (state.mode === "circle") {
    result = circleAngles();
  } else if (state.mode === "ellipse") {
    result = ellipseAngles();
  } else if (state.mode === "both") {
    const circleResult = circleAngles();
    const ellipseResult = ellipseAngles();
    if (circleResult && ellipseResult) {
      result = {
        left: (circleResult.left + ellipseResult.left) / 2,
        right: (circleResult.right + ellipseResult.right) / 2,
        label: "Both (avg)",
      };
    }
  }

  if (!result) return;
  leftAngleEl.textContent = `${result.left.toFixed(1)}°`;
  rightAngleEl.textContent = `${result.right.toFixed(1)}°`;
  methodEl.textContent = result.label;
});

function fitImage() {
  if (!state.image) return;
  const scale = Math.min(
    canvas.width / state.image.width,
    canvas.height / state.image.height,
  );
  state.scale = scale;
  state.offset = {
    x: (canvas.width - state.image.width * scale) / 2,
    y: (canvas.height - state.image.height * scale) / 2,
  };
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (state.image) {
    ctx.drawImage(
      state.image,
      state.offset.x,
      state.offset.y,
      state.image.width * state.scale,
      state.image.height * state.scale,
    );
  }

  drawLine(state.baseline, "#ffa640");
  drawPoints(state.baseline, "#ffa640");

  drawPoints(state.boundaryPoints, "#55b3f3");
  drawPoints(state.manualPoints, "#f05d5e");

  if (state.boundaryPoints.length > 2 && state.mode !== "manual") {
    const circle = fitCircle(state.boundaryPoints);
    if (circle) drawCircle(circle, "rgba(255, 166, 64, 0.6)");
    const ellipse = fitEllipse(state.boundaryPoints);
    if (ellipse) drawEllipse(ellipse, "rgba(80, 200, 120, 0.6)");
  }
}

function drawPoints(points, color) {
  ctx.fillStyle = color;
  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawLine(points, color) {
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  ctx.lineTo(points[1].x, points[1].y);
  ctx.stroke();
}

function drawCircle(circle, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(circle.cx, circle.cy, circle.r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawEllipse(ellipse, color) {
  ctx.save();
  ctx.translate(ellipse.cx, ellipse.cy);
  ctx.rotate(ellipse.rotation);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, ellipse.rx, ellipse.ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function manualAngles() {
  if (state.manualPoints.length < 4) {
    alert("Manual mode needs 4 points: left contact, right contact, left helper, right helper.");
    return null;
  }
  const [leftContact, rightContact, leftHelper, rightHelper] = state.manualPoints;
  const baseline = state.baseline;
  const baselineVec = vector(baseline[0], baseline[1]);

  const leftVec = vector(leftContact, leftHelper);
  const rightVec = vector(rightContact, rightHelper);

  return {
    left: ccwAngle(baselineVec, leftVec),
    right: ccwAngle(baselineVec, rightVec),
    label: "Manual",
  };
}

function circleAngles() {
  if (state.boundaryPoints.length < 3) {
    alert("Circle fit needs at least 3 boundary points.");
    return null;
  }
  const circle = fitCircle(state.boundaryPoints);
  if (!circle) return null;
  const intersections = intersectCircleLine(circle, state.baseline);
  if (!intersections) {
    alert("Circle did not intersect the baseline.");
    return null;
  }
  const [leftPoint, rightPoint] = sortLeftRight(intersections);
  const baselineVec = vector(state.baseline[0], state.baseline[1]);
  const center = { x: circle.cx, y: circle.cy };
  const leftTangent = perpendicular(vector(center, leftPoint));
  const rightTangent = perpendicular(vector(center, rightPoint));

  return {
    left: ccwAngle(baselineVec, leftTangent),
    right: ccwAngle(baselineVec, rightTangent),
    label: "Circle fit",
  };
}

function ellipseAngles() {
  if (state.boundaryPoints.length < 5) {
    alert("Ellipse fit needs at least 5 boundary points.");
    return null;
  }
  const ellipse = fitEllipse(state.boundaryPoints);
  if (!ellipse) return null;
  const intersections = intersectConicLine(ellipse.conic, state.baseline);
  if (!intersections) {
    alert("Ellipse did not intersect the baseline.");
    return null;
  }
  const [leftPoint, rightPoint] = sortLeftRight(intersections);
  const baselineVec = vector(state.baseline[0], state.baseline[1]);
  const leftTangent = ellipseTangent(ellipse.conic, leftPoint);
  const rightTangent = ellipseTangent(ellipse.conic, rightPoint);

  return {
    left: ccwAngle(baselineVec, leftTangent),
    right: ccwAngle(baselineVec, rightTangent),
    label: "Ellipse fit",
  };
}

function vector(a, b) {
  return { x: b.x - a.x, y: b.y - a.y };
}

function perpendicular(v) {
  return { x: -v.y, y: v.x };
}

function ccwAngle(v1, v2) {
  const mag1 = Math.hypot(v1.x, v1.y);
  const mag2 = Math.hypot(v2.x, v2.y);
  if (mag1 === 0 || mag2 === 0) return 0;
  const dot = v1.x * v2.x + v1.y * v2.y;
  const cross = v1.x * v2.y - v1.y * v2.x;
  let angle = (Math.atan2(cross, dot) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  if (angle > 180) angle = 360 - angle;
  return angle;
}

function sortLeftRight(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  return [sorted[0], sorted[sorted.length - 1]];
}

function fitCircle(points) {
  const n = points.length;
  if (n < 3) return null;
  let sumX = 0;
  let sumY = 0;
  let sumX2 = 0;
  let sumY2 = 0;
  let sumXY = 0;
  let sumX3 = 0;
  let sumY3 = 0;
  let sumX1Y2 = 0;
  let sumX2Y1 = 0;

  points.forEach((p) => {
    const x = p.x;
    const y = p.y;
    const x2 = x * x;
    const y2 = y * y;
    sumX += x;
    sumY += y;
    sumX2 += x2;
    sumY2 += y2;
    sumXY += x * y;
    sumX3 += x2 * x;
    sumY3 += y2 * y;
    sumX1Y2 += x * y2;
    sumX2Y1 += x2 * y;
  });

  const c = n * sumX2 - sumX * sumX;
  const d = n * sumXY - sumX * sumY;
  const e = n * sumY2 - sumY * sumY;
  const g = 0.5 * (n * sumX3 + n * sumX1Y2 - (sumX2 + sumY2) * sumX);
  const h = 0.5 * (n * sumY3 + n * sumX2Y1 - (sumX2 + sumY2) * sumY);

  const denom = c * e - d * d;
  if (Math.abs(denom) < 1e-9) return null;
  const cx = (g * e - d * h) / denom;
  const cy = (c * h - d * g) / denom;
  const r = Math.sqrt(
    (sumX2 + sumY2 - 2 * cx * sumX - 2 * cy * sumY) / n + cx * cx + cy * cy,
  );

  return { cx, cy, r };
}

function intersectCircleLine(circle, baseline) {
  const [p1, p2] = baseline;
  const v = vector(p1, p2);
  const fx = p1.x - circle.cx;
  const fy = p1.y - circle.cy;
  const a = v.x * v.x + v.y * v.y;
  const b = 2 * (fx * v.x + fy * v.y);
  const c = fx * fx + fy * fy - circle.r * circle.r;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);
  const points = [
    { x: p1.x + t1 * v.x, y: p1.y + t1 * v.y },
    { x: p1.x + t2 * v.x, y: p1.y + t2 * v.y },
  ];
  return points;
}

function intersectConicLine(conic, baseline) {
  const [p1, p2] = baseline;
  const v = vector(p1, p2);
  const { A, B, C, D, E, F } = conic;
  const x0 = p1.x;
  const y0 = p1.y;
  const vx = v.x;
  const vy = v.y;

  const a = A * vx * vx + B * vx * vy + C * vy * vy;
  const b =
    2 * A * x0 * vx +
    B * (x0 * vy + y0 * vx) +
    2 * C * y0 * vy +
    D * vx +
    E * vy;
  const c = A * x0 * x0 + B * x0 * y0 + C * y0 * y0 + D * x0 + E * y0 + F;
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) < 1e-9) return null;
    const t = -c / b;
    return [{ x: x0 + t * vx, y: y0 + t * vy }];
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sqrtD = Math.sqrt(disc);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);
  return [
    { x: x0 + t1 * vx, y: y0 + t1 * vy },
    { x: x0 + t2 * vx, y: y0 + t2 * vy },
  ];
}

function ellipseTangent(conic, point) {
  const { A, B, C, D, E } = conic;
  const x = point.x;
  const y = point.y;
  const gx = 2 * A * x + B * y + D;
  const gy = B * x + 2 * C * y + E;
  return { x: -gy, y: gx };
}

function fitEllipse(points) {
  const n = points.length;
  if (n < 5) return null;
  const D = points.map((p) => [
    p.x * p.x,
    p.x * p.y,
    p.y * p.y,
    p.x,
    p.y,
    1,
  ]);
  const S = matMul(transpose(D), D);

  const S11 = subMatrix(S, 0, 0, 3);
  const S12 = subMatrix(S, 0, 3, 3);
  const S21 = subMatrix(S, 3, 0, 3);
  const S22 = subMatrix(S, 3, 3, 3);

  const S22Inv = invert3(S22);
  if (!S22Inv) return null;
  const T = matScale(matMul(S22Inv, S21), -1);
  const M = matAdd(S11, matMul(S12, T));

  const C1 = [
    [0, 0, 2],
    [0, -1, 0],
    [2, 0, 0],
  ];
  const C1Inv = invert3(C1);
  if (!C1Inv) return null;
  const A = matMul(C1Inv, M);
  const eigen = eigenDecompose3(A, 80);
  if (!eigen) return null;

  let params = null;
  for (let i = 0; i < 3; i += 1) {
    const vec = eigen.vectors[i];
    const a = vec[0];
    const b = vec[1];
    const c = vec[2];
    if (4 * a * c - b * b > 0) {
      params = vec;
      break;
    }
  }
  if (!params) return null;

  const [a, b, c] = params;
  const d = T[0][0] * a + T[0][1] * b + T[0][2] * c;
  const e = T[1][0] * a + T[1][1] * b + T[1][2] * c;
  const f = T[2][0] * a + T[2][1] * b + T[2][2] * c;

  const conic = { A: a, B: b, C: c, D: d, E: e, F: f };
  const ellipse = conicToEllipse(conic);
  if (!ellipse) return null;
  return { ...ellipse, conic };
}

function conicToEllipse(conic) {
  const { A, B, C, D, E, F } = conic;
  const denom = B * B - 4 * A * C;
  if (denom === 0) return null;

  const x0 = (2 * C * D - B * E) / denom;
  const y0 = (2 * A * E - B * D) / denom;

  const theta = 0.5 * Math.atan2(B, A - C);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const Ap = A * cos * cos + B * cos * sin + C * sin * sin;
  const Cp = A * sin * sin - B * cos * sin + C * cos * cos;

  const F0 =
    F + D * x0 + E * y0 + A * x0 * x0 + B * x0 * y0 + C * y0 * y0;
  if (Ap === 0 || Cp === 0) return null;
  const rx = Math.sqrt(Math.abs(-F0 / Ap));
  const ry = Math.sqrt(Math.abs(-F0 / Cp));
  if (!isFinite(rx) || !isFinite(ry)) return null;

  return { cx: x0, cy: y0, rx, ry, rotation: theta };
}

function matMul(a, b) {
  const rows = a.length;
  const cols = b[0].length;
  const inner = b.length;
  const out = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < cols; j += 1) {
      let sum = 0;
      for (let k = 0; k < inner; k += 1) {
        sum += a[i][k] * b[k][j];
      }
      out[i][j] = sum;
    }
  }
  return out;
}

function matAdd(a, b) {
  return a.map((row, i) => row.map((val, j) => val + b[i][j]));
}

function matScale(a, scalar) {
  return a.map((row) => row.map((val) => val * scalar));
}

function transpose(a) {
  return a[0].map((_, i) => a.map((row) => row[i]));
}

function subMatrix(matrix, row, col, size) {
  const out = [];
  for (let i = 0; i < size; i += 1) {
    out.push(matrix[row + i].slice(col, col + size));
  }
  return out;
}

function invert3(m) {
  const [
    [a, b, c],
    [d, e, f],
    [g, h, i],
  ] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-10) return null;
  const invDet = 1 / det;
  return [
    [A * invDet, D * invDet, G * invDet],
    [B * invDet, E * invDet, H * invDet],
    [C * invDet, F * invDet, I * invDet],
  ];
}

function eigenDecompose3(matrix, iterations = 60) {
  let A = matrix.map((row) => row.slice());
  let Q = identity3();
  for (let i = 0; i < iterations; i += 1) {
    const { Q: q, R } = qrDecompose3(A);
    A = matMul(R, q);
    Q = matMul(Q, q);
  }
  const eigenvalues = [A[0][0], A[1][1], A[2][2]];
  const eigenvectors = [
    [Q[0][0], Q[1][0], Q[2][0]],
    [Q[0][1], Q[1][1], Q[2][1]],
    [Q[0][2], Q[1][2], Q[2][2]],
  ];
  return { eigenvalues, vectors: eigenvectors };
}

function qrDecompose3(m) {
  const a1 = [m[0][0], m[1][0], m[2][0]];
  const a2 = [m[0][1], m[1][1], m[2][1]];
  const a3 = [m[0][2], m[1][2], m[2][2]];

  const e1 = normalize(a1);
  const proj21 = scale(e1, dot(a2, e1));
  const u2 = subtract(a2, proj21);
  const e2 = normalize(u2);
  const proj31 = scale(e1, dot(a3, e1));
  const proj32 = scale(e2, dot(a3, e2));
  const u3 = subtract(subtract(a3, proj31), proj32);
  const e3 = normalize(u3);

  const Q = [
    [e1[0], e2[0], e3[0]],
    [e1[1], e2[1], e3[1]],
    [e1[2], e2[2], e3[2]],
  ];
  const R = matMul(transpose(Q), m);
  return { Q, R };
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(a, scalar) {
  return [a[0] * scalar, a[1] * scalar, a[2] * scalar];
}

function normalize(a) {
  const mag = Math.hypot(a[0], a[1], a[2]);
  if (mag === 0) return [0, 0, 0];
  return [a[0] / mag, a[1] / mag, a[2] / mag];
}

function identity3() {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
}

draw();
