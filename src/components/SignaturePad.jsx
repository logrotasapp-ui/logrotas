import { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from "react";

const C = {
  border: "#E4E9F0",
  navy: "#1E3A8A",
  subtle: "#F0F4FA",
};

function getPointer(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  const src = evt.touches?.[0] || evt.changedTouches?.[0] || evt;
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (src.clientX - rect.left) * scaleX,
    y: (src.clientY - rect.top) * scaleY,
  };
}

const SignaturePad = forwardRef(function SignaturePad({ height = 140, onChange }, ref) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const hasStrokeRef = useRef(false);
  const dprRef = useRef(1);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const rect = wrap.getBoundingClientRect();
    const displayW = Math.max(Math.round(rect.width), 280);
    const displayH = height;
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;

    canvas.width = Math.round(displayW * dpr);
    canvas.height = Math.round(displayH * dpr);
    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2 * dpr;
    ctx.strokeStyle = "#1A2B42";
    hasStrokeRef.current = false;
  }, [height]);

  useEffect(() => {
    setupCanvas();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setupCanvas());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [setupCanvas]);

  const notifyChange = () => onChange?.(hasStrokeRef.current);

  const startDraw = (evt) => {
    evt.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    lastPointRef.current = getPointer(canvas, evt);
  };

  const draw = (evt) => {
    if (!drawingRef.current) return;
    evt.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const point = getPointer(canvas, evt);
    const last = lastPointRef.current;
    if (!last) {
      lastPointRef.current = point;
      return;
    }
    const mid = { x: (last.x + point.x) / 2, y: (last.y + point.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.quadraticCurveTo(last.x, last.y, mid.x, mid.y);
    ctx.stroke();
    lastPointRef.current = point;
    if (!hasStrokeRef.current) {
      hasStrokeRef.current = true;
      notifyChange();
    }
  };

  const endDraw = (evt) => {
    if (!drawingRef.current) return;
    evt?.preventDefault?.();
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const clear = () => {
    setupCanvas();
    notifyChange();
  };

  useImperativeHandle(ref, () => ({
    clear,
    isEmpty: () => !hasStrokeRef.current,
    toBlob: () =>
      new Promise((resolve, reject) => {
        const canvas = canvasRef.current;
        if (!canvas || !hasStrokeRef.current) {
          reject(new Error("Assinatura vazia"));
          return;
        }
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Falha ao exportar assinatura."))),
          "image/png"
        );
      }),
  }));

  return (
    <div>
      <div
        ref={wrapRef}
        style={{
          border: `2px solid ${C.border}`,
          borderRadius: 12,
          overflow: "hidden",
          background: "#fff",
          touchAction: "none",
          width: "100%",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: "block", cursor: "crosshair" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      <button
        type="button"
        onClick={clear}
        style={{
          marginTop: 8,
          padding: "7px 14px",
          background: C.subtle,
          border: `1px solid ${C.border}`,
          borderRadius: 9,
          color: C.navy,
          fontWeight: 700,
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        Limpar assinatura
      </button>
    </div>
  );
});

export default SignaturePad;
