import React, { useState, useEffect, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import heic2any from 'heic2any';
import ImageEditor from './ImageEditor';
import { UploadCloud, FileVideo, FileImage, Download, Loader2, ArrowRight, X, Settings2, Scissors, Trash2 } from 'lucide-react';

// Module-level flag: prevent React StrictMode double-invocation from loading FFmpeg twice
let _ffmpegLoadStarted = false;

const SEGMENT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#f43f5e'];

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return `${m}:${sec.padStart(4, '0')}`;
}

function VideoTimeline({ duration, segments, currentTime, onSplitAt, onDelete }) {
  if (!duration || segments.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Timeline bar */}
      <div
        title="클릭하여 구간 분할"
        style={{ position: 'relative', height: '44px', background: 'rgba(0,0,0,0.35)', borderRadius: '0.5rem', overflow: 'hidden', cursor: 'crosshair', border: '1px solid var(--card-border)' }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          onSplitAt((e.clientX - rect.left) / rect.width * duration);
        }}
      >
        {segments.map((seg, i) => {
          const left = (seg.start / duration) * 100;
          const width = ((seg.end - seg.start) / duration) * 100;
          return (
            <div key={i} style={{
              position: 'absolute', left: `${left}%`, width: `${width}%`, height: '100%',
              background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] + 'aa',
              borderRight: i < segments.length - 1 ? '2px solid rgba(0,0,0,0.5)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            }}>
              <span style={{ fontSize: '0.68rem', color: 'white', fontWeight: 600, whiteSpace: 'nowrap', padding: '0 4px' }}>
                {fmtTime(seg.start)} – {fmtTime(seg.end)}
              </span>
            </div>
          );
        })}
        {/* Playhead */}
        <div style={{
          position: 'absolute',
          left: `${(currentTime / duration) * 100}%`,
          top: 0, bottom: 0, width: '2px',
          background: 'rgba(255,255,255,0.9)',
          zIndex: 10, pointerEvents: 'none',
        }} />
      </div>

      {/* Segment chips — only shown when more than 1 segment */}
      {segments.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {segments.map((seg, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] + '22',
              border: `1px solid ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}55`,
              borderRadius: '0.4rem', padding: '0.25rem 0.5rem', fontSize: '0.78rem',
            }}>
              <span>구간 {i+1}: {fmtTime(seg.start)} – {fmtTime(seg.end)}</span>
              <button
                onClick={() => onDelete(i)}
                title="이 구간 삭제"
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.65)', cursor: 'pointer', padding: '0 2px', lineHeight: 1, fontSize: '1rem' }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0 }}>
        타임라인 클릭 → 해당 위치에서 구간 분할 · 구간 칩의 🗑 → 해당 구간 삭제 후 자동 재배치
      </p>
    </div>
  );
}

function App() {
  const [loaded, setLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const ffmpegRef = useRef(new FFmpeg());
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);

  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [gifFile, setGifFile] = useState(null);
  const [gifUrl, setGifUrl] = useState(null);
  const [webpUrl, setWebpUrl] = useState(null);

  const [fileType, setFileType] = useState(null);
  const [isConvertingHeic, setIsConvertingHeic] = useState(false);
  const [imageEditorFile, setImageEditorFile] = useState(null);

  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);

  // Video trim / segment state
  const [videoDuration, setVideoDuration] = useState(0);
  const [segments, setSegments] = useState([]);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);

  // Conversion options
  const [fps, setFps] = useState(15);
  const [quality, setQuality] = useState(50);
  const [scale, setScale] = useState(480);
  const [compression, setCompression] = useState(4);
  const [sharpen, setSharpen] = useState(0);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(1);
  const [webpSize, setWebpSize] = useState(null);

  const loadFFmpeg = async () => {
    if (_ffmpegLoadStarted) return;
    _ffmpegLoadStarted = true;
    setIsLoading(true);
    const ffmpeg = ffmpegRef.current;
    ffmpeg.on('log', ({ message }) => console.log('FFmpeg:', message));
    ffmpeg.on('progress', ({ progress }) => setProgress(Math.round(progress * 100)));
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`/ffmpeg-core.wasm`, 'application/wasm'),
      });
      setLoaded(true);
    } catch (e) {
      _ffmpegLoadStarted = false;
      console.error('Error loading ffmpeg', e);
      alert('FFmpeg 로딩에 실패했습니다. (보안 정책 에러)');
    }
    setIsLoading(false);
  };

  const clearFile = () => {
    setVideoFile(null);
    setVideoUrl(null);
    setGifFile(null);
    setGifUrl(null);
    setWebpUrl(null);
    setWebpSize(null);
    setFileType(null);
    setImageEditorFile(null);
    setProgress(0);
    setSegments([]);
    setVideoDuration(0);
    setVideoCurrentTime(0);
  };

  const processSelectedFile = async (file) => {
    const isVideo = file.type.startsWith('video/');
    const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
    const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type === 'image/heic';
    const isImage = file.type.startsWith('image/');

    if (isVideo) {
      setFileType('video');
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setWebpUrl(null);
      setWebpSize(null);
      setProgress(0);
      setSegments([]);
    } else if (isGif) {
      setFileType('gif');
      setGifFile(file);
      setGifUrl(URL.createObjectURL(file));
      setWebpUrl(null);
      setWebpSize(null);
      setProgress(0);
    } else if (isHeic) {
      setFileType('image');
      setIsConvertingHeic(true);
      try {
        const resultBlob = await heic2any({ blob: file, toType: "image/jpeg", quality: 1.0 });
        const blob = Array.isArray(resultBlob) ? resultBlob[0] : resultBlob;
        setImageEditorFile({ url: URL.createObjectURL(blob), name: file.name });
      } catch (err) {
        console.error('HEIC conversion failed:', err);
        alert('HEIC 이미지를 읽는 데 실패했습니다.');
        setFileType(null);
      }
      setIsConvertingHeic(false);
    } else if (isImage) {
      setFileType('image');
      setImageEditorFile({ url: URL.createObjectURL(file), name: file.name });
    } else {
      alert('동영상, GIF, 혹은 사진 파일(.heic, .jpg 등)만 업로드 가능합니다!');
    }
  };

  const onFileDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) processSelectedFile(file);
  };

  const onFileInput = (e) => {
    const file = e.target.files[0];
    if (file) processSelectedFile(file);
  };

  const handleVideoMetadata = () => {
    const dur = videoRef.current?.duration || 0;
    if (dur && isFinite(dur)) {
      setVideoDuration(dur);
      setSegments([{ start: 0, end: dur }]);
    }
  };

  const handleSplitAt = (time) => {
    const segIdx = segments.findIndex(s => s.start < time && time < s.end);
    if (segIdx === -1) return;
    const seg = segments[segIdx];
    if (time - seg.start < 0.2 || seg.end - time < 0.2) return;
    setSegments([
      ...segments.slice(0, segIdx),
      { start: seg.start, end: time },
      { start: time, end: seg.end },
      ...segments.slice(segIdx + 1),
    ]);
  };

  const handleDeleteSegment = (idx) => {
    if (segments.length <= 1) return;
    setSegments(segments.filter((_, i) => i !== idx));
  };

  useEffect(() => { loadFFmpeg(); }, []);

  const convertGifToWebP = async () => {
    if (!gifFile) return;
    setIsConverting(true);
    setProgress(0);
    const ffmpeg = ffmpegRef.current;
    const inputName = 'input.gif';
    const outputName = 'output_animated.webp';

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(gifFile));
      const args = [
        '-i', inputName,
        '-vf', `scale=${scale}:-1:flags=lanczos`,
        '-vcodec', 'libwebp',
        '-q:v', quality.toString(),
        '-compression_level', compression.toString(),
        '-lossless', '0',
        '-loop', '0',
        '-an',
        outputName,
      ];
      await ffmpeg.exec(args);
      const data = await ffmpeg.readFile(outputName);
      const sizeMB = (data.byteLength / (1024 * 1024)).toFixed(2);
      setWebpSize(sizeMB < 1 ? (data.byteLength / 1024).toFixed(0) + ' KB' : sizeMB + ' MB');
      setWebpUrl(URL.createObjectURL(new Blob([data.buffer], { type: 'image/webp' })));
    } catch (e) {
      console.error('GIF Conversion Failed:', e);
      alert('GIF 변환 중 오류가 발생했습니다.');
    } finally {
      setIsConverting(false);
      setProgress(100);
    }
  };

  const convertToWebP = async () => {
    if (!videoFile) return;
    setIsConverting(true);
    setProgress(0);
    const ffmpeg = ffmpegRef.current;
    const inputName = 'input_video.mp4';
    const outputName = 'output_animated.webp';

    try {
      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

      const activeSegments = segments.length > 0 ? segments : [{ start: 0, end: videoDuration }];

      // Build base vf filter parts (without fps — applied separately per segment)
      let vfBase = `scale=${scale}:-1:flags=lanczos,fps=${fps}`;
      if (parseFloat(sharpen) > 0) vfBase += `,unsharp=5:5:${sharpen}:5:5:0.0`;
      if (parseFloat(brightness) !== 0 || parseFloat(contrast) !== 1) vfBase += `,eq=brightness=${brightness}:contrast=${contrast}`;
      vfBase += ',format=yuv420p';

      const codecArgs = ['-vcodec', 'libwebp', '-q:v', quality.toString(), '-compression_level', compression.toString(), '-lossless', '0', '-loop', '0', '-an'];

      let args;
      if (activeSegments.length === 1) {
        const seg = activeSegments[0];
        args = ['-i', inputName];
        if (seg.start > 0.01) args.push('-ss', seg.start.toFixed(3));
        if (seg.end < videoDuration - 0.01) args.push('-to', seg.end.toFixed(3));
        args.push(...codecArgs, '-vf', vfBase, outputName);
      } else {
        // Trim each segment separately, concat raw streams, then apply vf filters once at the end
        const parts = activeSegments.map((seg, i) =>
          `[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`
        );
        const concatIn = activeSegments.map((_, i) => `[v${i}]`).join('');
        parts.push(`${concatIn}concat=n=${activeSegments.length}:v=1:a=0[cat]`);
        parts.push(`[cat]${vfBase}[out]`);
        args = [
          '-i', inputName,
          '-filter_complex', parts.join(';'),
          '-map', '[out]',
          ...codecArgs,
          outputName,
        ];
      }

      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile(outputName);
      const sizeMB = (data.byteLength / (1024 * 1024)).toFixed(2);
      setWebpSize(sizeMB < 1 ? (data.byteLength / 1024).toFixed(0) + ' KB' : sizeMB + ' MB');
      setWebpUrl(URL.createObjectURL(new Blob([data.buffer], { type: 'image/webp' })));
    } catch (e) {
      console.error('Conversion Failed:', e);
      alert('변환 중 오류가 발생했습니다.');
    } finally {
      setIsConverting(false);
      setProgress(100);
    }
  };

  return (
    <div className="container animate-fade-in">
      <div className="header">
        <h1>비디오를 WebP 움짤로 🚀</h1>
        <p>서버 업로드 없이 브라우저에서 안전하고 빠르게 변환하세요.</p>
      </div>

      <div className="glass" style={{ padding: '2rem', borderRadius: '1.5rem' }}>

        {!videoUrl && !imageEditorFile && (
          <div
            className="card drop-zone animate-fade-in"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onFileDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {isConvertingHeic ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: 'var(--text-secondary)' }}>
                <Loader2 size={48} className="animate-spin text-primary" />
                <p>아이폰 사진(HEIC)을 읽어들이는 중입니다...</p>
              </div>
            ) : (
              <>
                <UploadCloud size={64} className="text-primary" style={{ marginBottom: '1rem', opacity: 0.8 }} />
                <h3>클릭하거나 파일을 이곳에 드롭하세요</h3>
                <p>지원 포맷: MP4, MOV, WEBM / GIF / HEIC, JPG, PNG</p>
              </>
            )}
            <input
              type="file" ref={fileInputRef} style={{ display: 'none' }}
              accept="video/*,.heic,.heif,image/gif,image/jpeg,image/png"
              onChange={onFileInput}
            />
          </div>
        )}

        {fileType === 'image' && imageEditorFile && (
          <ImageEditor fileUrl={imageEditorFile.url} fileName={imageEditorFile.name} onBack={clearFile} />
        )}

        {fileType === 'gif' && gifUrl && (
          <div className="split-layout animate-fade-in">
            <div className="main-preview-area glass" style={{ padding: '2rem', borderRadius: '1.5rem' }}>
              <div className="file-info" style={{ borderBottom: '1px solid var(--card-border)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <FileImage style={{ color: 'var(--accent)' }} size={32} />
                  <div>
                    <h4 style={{ fontWeight: 600 }}>{gifFile.name}</h4>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      {(gifFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button className="btn btn-danger" onClick={clearFile} disabled={isConverting} style={{ padding: '0.5rem', borderRadius: '0.5rem' }}>
                  <X size={20} />
                </button>
              </div>

              {!webpUrl ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '0.75rem', padding: '1rem', border: '1px solid var(--card-border)' }}>
                    <img src={gifUrl} alt="GIF preview" style={{ maxWidth: '100%', maxHeight: '50vh', borderRadius: '0.5rem', objectFit: 'contain' }} />
                  </div>
                  <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    오른쪽 패널에서 옵션을 조절한 뒤 [WebP로 변환]을 누르세요
                  </p>
                </div>
              ) : (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0 }}>🎉 변환 완료!</h3>
                    {webpSize && (
                      <span style={{ background: 'rgba(16,185,129,0.2)', color: 'var(--success)', padding: '0.5rem 1rem', borderRadius: '2rem', fontWeight: 'bold' }}>
                        최종 크기: {webpSize}
                      </span>
                    )}
                  </div>
                  <div className="preview-container" style={{ flex: 1 }}>
                    <img src={webpUrl} alt="Converted WebP" style={{ maxHeight: '50vh', objectFit: 'contain' }} />
                  </div>
                </div>
              )}
            </div>

            <div className="controls-sidebar">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--card-border)', paddingBottom: '1rem' }}>
                <Settings2 size={20} /> GIF → WebP 변환 옵션
              </h3>

              <div className="options-panel" style={{ background: 'none', border: 'none', padding: 0 }}>
                <div className="option-group" style={{ margin: 0 }}>
                  <label>출력 너비 (Width: {scale}px)</label>
                  <input type="range" min="200" max="800" step="10" value={scale} onChange={e => setScale(e.target.value)} disabled={isConverting} />
                </div>
                <div className="option-group" style={{ margin: 0 }}>
                  <label>화질 퀄리티 ({quality}%)</label>
                  <input type="range" min="10" max="100" step="5" value={quality} onChange={e => setQuality(e.target.value)} disabled={isConverting} />
                </div>
                <div className="option-group" style={{ margin: 0 }}>
                  <label>압축 레벨 ({compression})</label>
                  <input type="range" min="0" max="6" step="1" value={compression} onChange={e => setCompression(e.target.value)} disabled={isConverting} />
                </div>
              </div>

              {!webpUrl ? (
                <button
                  className="btn btn-success"
                  onClick={convertGifToWebP}
                  disabled={!loaded || isConverting}
                  style={{ width: '100%', padding: '1.25rem', marginTop: 'auto', display: 'flex', justifyContent: 'center' }}
                >
                  {isLoading ? (
                    <><Loader2 className="animate-spin" /> 변환 모듈 로딩 중...</>
                  ) : isConverting ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                      <div><Loader2 className="animate-spin" /> 변환 중... ({progress}%)</div>
                      <div className="progress-bar" style={{ background: 'rgba(0,0,0,0.2)' }}>
                        <div className="progress-fill" style={{ width: `${progress}%`, background: 'white' }}></div>
                      </div>
                    </div>
                  ) : (
                    <>✨ GIF → WebP 움짤 변환하기 <ArrowRight size={20} /></>
                  )}
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: 'auto' }}>
                  <a href={webpUrl} download={`${gifFile.name.replace(/\.gif$/i, '')}_animated.webp`} style={{ textDecoration: 'none' }}>
                    <button className="btn btn-success" style={{ width: '100%' }}>
                      <Download size={20} /> 성공! 다운로드
                    </button>
                  </a>
                  <button className="btn" onClick={clearFile} style={{ width: '100%', border: '1px solid var(--card-border)', background: 'transparent' }}>
                    아예 새로 만들기
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {fileType === 'video' && videoUrl && (
          <div className="split-layout animate-fade-in">

            {/* Left: preview + timeline */}
            <div className="main-preview-area glass" style={{ padding: '2rem', borderRadius: '1.5rem' }}>
              <div className="file-info" style={{ borderBottom: '1px solid var(--card-border)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <FileVideo style={{ color: 'var(--accent)' }} size={32} />
                  <div>
                    <h4 style={{ fontWeight: 600 }}>{videoFile.name}</h4>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      {(videoFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <button className="btn btn-danger" onClick={clearFile} disabled={isConverting} style={{ padding: '0.5rem', borderRadius: '0.5rem' }}>
                  <X size={20} />
                </button>
              </div>

              {!webpUrl ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    loop
                    onLoadedMetadata={handleVideoMetadata}
                    onTimeUpdate={() => setVideoCurrentTime(videoRef.current?.currentTime || 0)}
                    style={{ width: '100%', maxHeight: '50vh', borderRadius: '0.75rem', background: '#000', objectFit: 'contain' }}
                  />

                  {/* Timeline */}
                  <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '0.75rem', padding: '1rem', border: '1px solid var(--card-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <Scissors size={15} style={{ color: 'var(--accent)' }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>구간 편집</span>
                      {segments.length > 1 && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                          {segments.length}개 구간 · 총 {fmtTime(segments.reduce((sum, s) => sum + s.end - s.start, 0))}
                        </span>
                      )}
                    </div>
                    <VideoTimeline
                      duration={videoDuration}
                      segments={segments}
                      currentTime={videoCurrentTime}
                      onSplitAt={handleSplitAt}
                      onDelete={handleDeleteSegment}
                    />
                    {segments.length > 1 && (
                      <button
                        className="btn"
                        onClick={() => setSegments([{ start: 0, end: videoDuration }])}
                        style={{ background: 'transparent', border: '1px solid var(--card-border)', padding: '0.35rem 0.75rem', fontSize: '0.8rem', marginTop: '0.75rem' }}
                      >
                        구간 초기화
                      </button>
                    )}
                  </div>

                  <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    오른쪽 패널에서 옵션을 조절한 뒤 [움짤 굽기]를 누르세요
                  </p>
                </div>
              ) : (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0 }}>🎉 변환 완료!</h3>
                    {webpSize && (
                      <span style={{ background: 'rgba(16,185,129,0.2)', color: 'var(--success)', padding: '0.5rem 1rem', borderRadius: '2rem', fontWeight: 'bold' }}>
                        최종 크기: {webpSize}
                      </span>
                    )}
                  </div>
                  <div className="preview-container" style={{ flex: 1 }}>
                    <img src={webpUrl} alt="Converted WebP" style={{ maxHeight: '50vh', objectFit: 'contain' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Right: controls */}
            <div className="controls-sidebar">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--card-border)', paddingBottom: '1rem' }}>
                <Settings2 size={20} /> 동영상 변환 및 보정
              </h3>

              <div className="options-panel" style={{ background: 'none', border: 'none', padding: 0 }}>
                <div className="option-group" style={{ margin: 0 }}>
                  <label>웹 사이즈 너비 (Width: {scale}px)</label>
                  <input type="range" min="200" max="800" step="10" value={scale} onChange={e => setScale(e.target.value)} disabled={isConverting} />
                </div>
                <div className="option-group" style={{ margin: 0 }}>
                  <label>움짤 속도 (FPS: {fps})</label>
                  <input type="range" min="5" max="30" step="1" value={fps} onChange={e => setFps(e.target.value)} disabled={isConverting} />
                </div>
                <div className="option-group" style={{ margin: 0 }}>
                  <label>화질 퀄리티 ({quality}%)</label>
                  <input type="range" min="10" max="100" step="5" value={quality} onChange={e => setQuality(e.target.value)} disabled={isConverting} />
                </div>
                <div className="option-group" style={{ margin: 0 }}>
                  <label>초고효율 압축 레벨 ({compression})</label>
                  <input type="range" min="0" max="6" step="1" value={compression} onChange={e => setCompression(e.target.value)} disabled={isConverting} />
                </div>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--card-border)' }} />

              <div className="options-panel" style={{ background: 'none', border: 'none', padding: 0 }}>
                <div className="option-group" style={{ margin: 0 }}>
                  <label>샤픈 ({sharpen == 0 ? '원본' : sharpen})</label>
                  <input type="range" min="0" max="1.5" step="0.1" value={sharpen} onChange={e => setSharpen(e.target.value)} disabled={isConverting} />
                </div>
                <div className="option-group" style={{ margin: 0 }}>
                  <label>밝기 ({brightness == 0 ? '원본' : brightness})</label>
                  <input type="range" min="-1.0" max="1.0" step="0.1" value={brightness} onChange={e => setBrightness(e.target.value)} disabled={isConverting} />
                </div>
                <div className="option-group" style={{ margin: 0 }}>
                  <label>대비 ({contrast == 1 ? '원본' : contrast})</label>
                  <input type="range" min="0.0" max="2.0" step="0.1" value={contrast} onChange={e => setContrast(e.target.value)} disabled={isConverting} />
                </div>
              </div>

              {!webpUrl ? (
                <button
                  className="btn btn-success"
                  onClick={convertToWebP}
                  disabled={!loaded || isConverting}
                  style={{ width: '100%', padding: '1.25rem', marginTop: 'auto', display: 'flex', justifyContent: 'center' }}
                >
                  {isLoading ? (
                    <><Loader2 className="animate-spin" /> 변환 모듈 로딩 중...</>
                  ) : isConverting ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                      <div><Loader2 className="animate-spin" /> 움짤 굽는 중... ({progress}%)</div>
                      <div className="progress-bar" style={{ background: 'rgba(0,0,0,0.2)' }}>
                        <div className="progress-fill" style={{ width: `${progress}%`, background: 'white' }}></div>
                      </div>
                    </div>
                  ) : (
                    <>✨ 지금 바로 움짤 굽기 <ArrowRight size={20} /></>
                  )}
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: 'auto' }}>
                  <a href={webpUrl} download={`${videoFile.name.split('.')[0]}_animated.webp`} style={{ textDecoration: 'none' }}>
                    <button className="btn btn-success" style={{ width: '100%' }}>
                      <Download size={20} /> 성공! 다운로드
                    </button>
                  </a>
                  <button className="btn" onClick={clearFile} style={{ width: '100%', border: '1px solid var(--card-border)', background: 'transparent' }}>
                    아예 새로 만들기
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
