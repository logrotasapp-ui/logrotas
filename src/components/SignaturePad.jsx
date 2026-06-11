import { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from "react";

const C = {
  border: "#E4E9F0",
  navy: "#1E3A8A",
  subtle: "#F0F4FA",
};

function getPointer(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY,
  };
}

function getCoalescedPointers(canvas, evt) {
  const events = typeof evt.getCoalescedEvents === "function" ? evt.getCoalescedEvents() : [evt];
  return events.map((e) => getPointer(canvas, e));
}

const SignaturePad = forwardRef(function SignaturePad({ height = 140, onChange, hideClear = false }, ref) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
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
    ctx.lineWidth = 2.5 * dpr;
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

  const onPointerDown = (evt) => {
    evt.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(evt.pointerId);
    drawingRef.current = true;

    const ctx = canvas.getContext("2d");
    const [first] = getCoalescedPointers(canvas, evt);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);

    if (!hasStrokeRef.current) {
      hasStrokeRef.current = true;
      notifyChange();
    }
  };

  const onPointerMove = (evt) => {
    if (!drawingRef.current) return;
    evt.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const points = getCoalescedPointers(canvas, evt);
    for (const p of points) {
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  };

  const onPointerUp = (evt) => {
    if (!drawingRef.current) return;
    evt.preventDefault();
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture?.(evt.pointerId)) {
      canvas.releasePointerCapture(evt.pointerId);
    }
    drawingRef.current = false;
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
          style={{ display: "block", cursor: "crosshair", touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      </div>
      {!hideClear && (
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
      )}
    </div>
  );
});

export default SignaturePad;
