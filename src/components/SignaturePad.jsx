import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";

const C = {
  border: "#E4E9F0",
  navy: "#1E3A8A",
  muted: "#8EA3BC",
  subtle: "#F0F4FA",
};

function getPoint(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const src = evt.touches?.[0] || evt.changedTouches?.[0] || evt;
  return {
    x: (src.clientX - rect.left) * scaleX,
    y: (src.clientY - rect.top) * scaleY,
  };
}

const SignaturePad = forwardRef(function SignaturePad({ width = 320, height = 140, onChange }, ref) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const hasStrokeRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#1A2B42";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
  }, [width, height]);

  const notifyChange = () => onChange?.(hasStrokeRef.current);

  const startDraw = (evt) => {
    evt.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawingRef.current = true;
    lastPointRef.current = getPoint(canvas, evt);
  };

  const draw = (evt) => {
    if (!drawingRef.current) return;
    evt.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const point = getPoint(canvas, evt);
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#1A2B42";
    hasStrokeRef.current = false;
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
        style={{
          border: `2px solid ${C.border}`,
          borderRadius: 12,
          overflow: "hidden",
          background: "#fff",
          touchAction: "none",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height, display: "block", cursor: "crosshair" }}
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
