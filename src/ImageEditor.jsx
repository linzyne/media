import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Loader2, ArrowLeft, Image as ImageIcon, Crop, TrendingUp } from 'lucide-react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

// Monotone cubic spline interpolation
function createSpline(points) {
  const n = points.length;
  if (n < 2) return (x) => x;
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i+1]-ys[i])/(xs[i+1]-xs[i]));
  const m = new Array(n);
  m[0] = d[0]; m[n-1] = d[n-2];
  for (let i = 1; i < n-1; i++) m[i] = (d[i-1]+d[i])/2;
  for (let i = 0; i < n-1; i++) {
    if (Math.abs(d[i]) < 1e-10) { m[i] = m[i+1] = 0; continue; }
    const a = m[i]/d[i], b = m[i+1]/d[i], h = Math.sqrt(a*a+b*b);
    if (h > 3) { m[i] = 3*a/h*d[i]; m[i+1] = 3*b/h*d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n-1]) return ys[n-1];
    let lo = 0;
    while (lo < n-2 && xs[lo+1] <= x) lo++;
    const t = (x-xs[lo])/(xs[lo+1]-xs[lo]), dx = xs[lo+1]-xs[lo];
    const t2=t*t, t3=t2*t;
    return (2*t3-3*t2+1)*ys[lo] + (t3-2*t2+t)*dx*m[lo] + (-2*t3+3*t2)*ys[lo+1] + (t3-t2)*dx*m[lo+1];
  };
}

const CS = 180;
const DEFAULT_CURVE = [{ x: 0, y: 0 }, { x: 1, y: 1 }];

function isIdentityCurve(pts) {
  return pts.length === 2 && pts[0].x === 0 && pts[0].y === 0 && pts[1].x === 1 && pts[1].y === 1;
}

function CurvesCanvas({ points, onChange }) {
  const cvRef = useRef(null);
  const dragRef = useRef(null);

  const draw = useCallback(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, CS, CS);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, CS, CS);

    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(v => {
      ctx.beginPath(); ctx.moveTo(v*CS, 0); ctx.lineTo(v*CS, CS); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, v*CS); ctx.lineTo(CS, v*CS); ctx.stroke();
    });

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(0, CS); ctx.lineTo(CS, 0); ctx.stroke();
    ctx.setLineDash([]);

    const sorted = [...points].sort((a, b) => a.x - b.x);
    if (sorted.length >= 2) {
      const sp = createSpline(sorted);
      ctx.strokeStyle = '#818cf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let px = 0; px <= CS; px++) {
        const py = Math.min(1, Math.max(0, sp(px / CS)));
        px === 0 ? ctx.moveTo(px, CS - py*CS) : ctx.lineTo(px, CS - py*CS);
      }
      ctx.stroke();
    }

    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x*CS, (1-p.y)*CS, 5, 0, Math.PI*2);
      ctx.fillStyle = '#6366f1'; ctx.fill();
      ctx.strokeStyle = 'white'; ctx.lineWidth = 1.5; ctx.stroke();
    });
  }, [points]);

  useEffect(() => { draw(); }, [draw]);

  const getPos = (e) => {
    const r = cvRef.current.getBoundingClientRect();
    return {
      cx: (e.clientX - r.left) * (CS / r.width),
      cy: (e.clientY - r.top) * (CS / r.height),
    };
  };

  const findNear = (cx, cy) => {
    for (let i = 0; i < points.length; i++) {
      const dx = points[i].x*CS - cx, dy = (1-points[i].y)*CS - cy;
      if (Math.sqrt(dx*dx + dy*dy) < 12) return i;
    }
    return -1;
  };

  const onMouseDown = (e) => {
    e.preventDefault();
    const { cx, cy } = getPos(e);
    const idx = findNear(cx, cy);
    if (idx >= 0) {
      dragRef.current = idx;
    } else {
      const pt = { x: Math.min(1, Math.max(0, cx/CS)), y: Math.min(1, Math.max(0, 1 - cy/CS)) };
      const next = [...points, pt].sort((a, b) => a.x - b.x);
      onChange(next);
      dragRef.current = next.findIndex(p => p.x === pt.x && p.y === pt.y);
    }
  };

  const onMouseMove = (e) => {
    if (dragRef.current === null) return;
    const { cx, cy } = getPos(e);
    const nx = Math.min(1, Math.max(0, cx/CS));
    const ny = Math.min(1, Math.max(0, 1 - cy/CS));
    const updated = points.map((p, i) => i === dragRef.current ? { x: nx, y: ny } : p);
    const sorted = [...updated].sort((a, b) => a.x - b.x);
    dragRef.current = sorted.findIndex(p => p.x === nx && p.y === ny);
    onChange(sorted);
  };

  const onMouseUp = (e) => {
    if (dragRef.current === null) return;
    const { cx, cy } = getPos(e);
    const idx = dragRef.current;
    if ((cx < -20 || cx > CS+20 || cy < -20 || cy > CS+20) && idx > 0 && idx < points.length - 1) {
      onChange(points.filter((_, i) => i !== idx));
    }
    dragRef.current = null;
  };

  return (
    <canvas
      ref={cvRef}
      width={CS} height={CS}
      style={{ width: '100%', maxWidth: `${CS}px`, cursor: 'crosshair', borderRadius: '0.5rem', border: '1px solid rgba(255,255,255,0.15)', display: 'block' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    />
  );
}

const ImageEditor = ({ fileUrl, fileName, onBack }) => {
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [sharpen, setSharpen] = useState(0);
  const [hue, setHue] = useState(0);
  const [temperature, setTemperature] = useState(0);
  const [curvePoints, setCurvePoints] = useState([...DEFAULT_CURVE]);

  const [crop, setCrop] = useState(null);
  const [completedCrop, setCompletedCrop] = useState(null);
  const [aspect, setAspect] = useState(undefined);

  const [isProcessing, setIsProcessing] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  const canvasRef = useRef(null);
  const originalImageRef = useRef(null);
  const debounceTimer = useRef(null);

  const applySharpen = (imageData, amount) => {
    if (amount <= 0) return imageData;
    const w = imageData.width, h = imageData.height;
    const data = imageData.data;
    const output = new ImageData(new Uint8ClampedArray(data), w, h);
    const out = output.data;
    const a = amount / 100;
    for (let y = 1; y < h-1; y++) {
      for (let x = 1; x < w-1; x++) {
        const idx = (y*w+x)*4;
        const up = ((y-1)*w+x)*4, dn = ((y+1)*w+x)*4;
        const lt = (y*w+(x-1))*4, rt = (y*w+(x+1))*4;
        for (let c = 0; c < 3; c++) {
          out[idx+c] = data[idx+c]*(1+4*a) - data[up+c]*a - data[dn+c]*a - data[lt+c]*a - data[rt+c]*a;
        }
        out[idx+3] = data[idx+3];
      }
    }
    return output;
  };

  const applyTemperature = (imageData, temp) => {
    if (temp === 0) return imageData;
    const data = imageData.data;
    const output = new ImageData(new Uint8ClampedArray(data), imageData.width, imageData.height);
    const out = output.data;
    for (let i = 0; i < data.length; i += 4) {
      out[i]   = Math.min(255, Math.max(0, data[i]   + temp));
      out[i+1] = data[i+1];
      out[i+2] = Math.min(255, Math.max(0, data[i+2] - temp));
      out[i+3] = data[i+3];
    }
    return output;
  };

  const applyCurve = useCallback((imageData) => {
    const sorted = [...curvePoints].sort((a, b) => a.x - b.x);
    if (isIdentityCurve(sorted)) return imageData;
    const spline = createSpline(sorted);
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      lut[i] = Math.min(255, Math.max(0, Math.round(spline(i/255) * 255)));
    }
    const data = imageData.data;
    const output = new ImageData(new Uint8ClampedArray(data), imageData.width, imageData.height);
    const out = output.data;
    for (let i = 0; i < data.length; i += 4) {
      out[i]   = lut[data[i]];
      out[i+1] = lut[data[i+1]];
      out[i+2] = lut[data[i+2]];
      out[i+3] = data[i+3];
    }
    return output;
  }, [curvePoints]);

  const processImage = useCallback((targetCanvas, isPreview = true) => {
    return new Promise((resolve) => {
      const img = originalImageRef.current;
      if (!img) return resolve();
      const ctx = targetCanvas.getContext('2d');
      if (!ctx) return resolve();

      let tw = img.width, th = img.height;
      if (isPreview && tw > 800) { const r = 800/tw; tw = 800; th = img.height*r; }
      targetCanvas.width = tw;
      targetCanvas.height = th;

      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hue}deg)`;
      ctx.drawImage(img, 0, 0, tw, th);
      ctx.filter = 'none';

      let imageData = ctx.getImageData(0, 0, tw, th);
      if (temperature !== 0) imageData = applyTemperature(imageData, temperature);
      if (sharpen > 0) imageData = applySharpen(imageData, sharpen);
      imageData = applyCurve(imageData);
      ctx.putImageData(imageData, 0, 0);

      resolve();
    });
  }, [brightness, contrast, saturation, hue, temperature, sharpen, applyCurve]);

  const updatePreviewAsync = useCallback(async () => {
    setIsProcessing(true);
    await processImage(canvasRef.current, true);
    setIsProcessing(false);
  }, [processImage]);

  useEffect(() => {
    if (!originalImageRef.current) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => { updatePreviewAsync(); }, 100);
    return () => clearTimeout(debounceTimer.current);
  }, [brightness, contrast, saturation, hue, temperature, sharpen, curvePoints, updatePreviewAsync]);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => { originalImageRef.current = img; updatePreviewAsync(); };
    img.src = fileUrl;
  }, [fileUrl, updatePreviewAsync]);

  const handleDownload = async () => {
    setIsDownloading(true);
    const offscreenCanvas = document.createElement('canvas');
    await processImage(offscreenCanvas, false);
    let finalCanvas = offscreenCanvas;
    if (completedCrop && completedCrop.width > 0 && completedCrop.height > 0) {
      const scaleX = offscreenCanvas.width / canvasRef.current.width;
      const scaleY = offscreenCanvas.height / canvasRef.current.height;
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = completedCrop.width * scaleX;
      cropCanvas.height = completedCrop.height * scaleY;
      const cropCtx = cropCanvas.getContext('2d');
      cropCtx.drawImage(offscreenCanvas, completedCrop.x*scaleX, completedCrop.y*scaleY, completedCrop.width*scaleX, completedCrop.height*scaleY, 0, 0, cropCanvas.width, cropCanvas.height);
      finalCanvas = cropCanvas;
    }
    finalCanvas.toBlob((blob) => {
      if (!blob) { setIsDownloading(false); return; }
      const newName = fileName.replace(/\.heic$/i, '.jpg');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = newName.endsWith('.jpg') ? newName : newName + '.jpg';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setIsDownloading(false);
    }, 'image/jpeg', 0.95);
  };

  const handleReset = () => {
    setBrightness(100); setContrast(100); setSaturation(100); setSharpen(0);
    setHue(0); setTemperature(0); setCurvePoints([...DEFAULT_CURVE]);
    setCrop(null); setCompletedCrop(null); setAspect(undefined);
  };

  return (
    <div className="split-layout animate-fade-in">
      <div className="main-preview-area glass" style={{ padding: '2rem', borderRadius: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--card-border)', paddingBottom: '1rem', marginBottom: '1rem' }}>
          <button className="btn" onClick={onBack} style={{ background: 'transparent', border: '1px solid var(--card-border)', padding: '0.5rem 1rem' }}>
            <ArrowLeft size={18} /> 이전 화면으로
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ImageIcon size={20} className="text-primary" />
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>사진 보정 에디터</h2>
          </div>
        </div>

        <div style={{ position: 'relative', width: '100%', background: 'rgba(0,0,0,0.2)', borderRadius: '1rem', overflow: 'hidden', minHeight: '300px', border: '1px solid var(--card-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isProcessing && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
              <Loader2 className="animate-spin text-primary" size={40} />
            </div>
          )}
          <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)} aspect={aspect}>
            <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block' }} />
          </ReactCrop>
        </div>
      </div>

      <div className="controls-sidebar">
        {/* Crop */}
        <div className="option-group" style={{ margin: 0 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Crop size={16} /> 자르기 비율 (Crop)
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[['자유', undefined], ['1:1', 1], ['16:9', 16/9], ['4:3', 4/3]].map(([label, val]) => (
              <button key={label} className="btn" onClick={() => setAspect(val)} style={{ flex: 1, padding: '0.5rem', opacity: aspect === val ? 1 : 0.5, border: '1px solid var(--card-border)' }}>{label}</button>
            ))}
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--card-border)' }} />

        {/* Curves */}
        <div className="option-group" style={{ margin: 0 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <TrendingUp size={16} /> 곡선 (Curves)
          </label>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <CurvesCanvas points={curvePoints} onChange={setCurvePoints} />
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0.4rem 0 0', textAlign: 'center' }}>
            클릭: 포인트 추가 · 드래그: 이동 · 영역 밖으로 드래그: 삭제
          </p>
          <button
            className="btn"
            onClick={() => setCurvePoints([...DEFAULT_CURVE])}
            style={{ background: 'transparent', border: '1px solid var(--card-border)', padding: '0.35rem 0.75rem', fontSize: '0.8rem', marginTop: '0.5rem' }}
          >
            곡선 초기화
          </button>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--card-border)' }} />

        {/* Tone */}
        {[
          ['밝기 (Brightness)', brightness, setBrightness, 0, 200, 5, `${brightness}%`],
          ['대비 (Contrast)', contrast, setContrast, 0, 200, 5, `${contrast}%`],
          ['채도 (Saturation)', saturation, setSaturation, 0, 200, 5, `${saturation}%`],
          ['샤픈 (Sharpen)', sharpen, setSharpen, 0, 100, 1, `${sharpen}%`],
        ].map(([label, val, setter, min, max, step, display]) => (
          <div key={label} className="option-group" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <label>{label}</label>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{display}</span>
            </div>
            <input type="range" min={min} max={max} step={step} value={val} onChange={e => setter(Number(e.target.value))} disabled={isDownloading} />
          </div>
        ))}

        <hr style={{ border: 'none', borderTop: '1px solid var(--card-border)' }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>🎨 컬러 조절</p>

        <div className="option-group" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <label>색조 (Hue Rotate)</label>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{hue > 0 ? `+${hue}°` : `${hue}°`}</span>
          </div>
          <input type="range" min="-180" max="180" step="1" value={hue} onChange={e => setHue(Number(e.target.value))} disabled={isDownloading} style={{ background: 'linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red)' }} />
        </div>

        <div className="option-group" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <label>색온도 {temperature < 0 ? '❄️' : temperature > 0 ? '🔥' : ''}</label>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{temperature > 0 ? `+${temperature}` : temperature}</span>
          </div>
          <input type="range" min="-100" max="100" step="1" value={temperature} onChange={e => setTemperature(Number(e.target.value))} disabled={isDownloading} style={{ background: 'linear-gradient(to right, #60a5fa, #f3f4f6, #f97316)' }} />
        </div>

        <button className="btn" onClick={handleReset} style={{ background: 'transparent', border: '1px solid var(--card-border)' }} disabled={isDownloading}>
          전체 초기화
        </button>

        <button
          className="btn btn-success"
          onClick={handleDownload}
          disabled={isDownloading || isProcessing}
          style={{ padding: '1.25rem', marginTop: 'auto', fontSize: '1.05rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
        >
          {isDownloading ? <><Loader2 className="animate-spin" /> 원본 화질 저장 중...</> : <><Download /> 고화질 JPG로 저장하기</>}
        </button>
      </div>
    </div>
  );
};

export default ImageEditor;
